import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import * as Y from 'yjs';
import { Repository } from 'typeorm';
import { CardsetIncremental } from '../cardset/entities/cardset-incremental.entity';
import { Cardset } from '../cardset/entities/cardset.entity';

@Injectable()
export class YjsDocumentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YjsDocumentService.name);
  private redisClient: Redis;
  private readonly mysqlFlushDelayMs: number;
  private readonly flushTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CardsetIncremental)
    private readonly cardsetIncrementalRepository: Repository<CardsetIncremental>,
  ) {
    this.mysqlFlushDelayMs =
      this.configService.get<number>('YJS_MYSQL_FLUSH_DELAY_MS') || 60000;
  }

  onModuleInit() {
    const redisHost =
      this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = this.configService.get<number>('REDIS_PORT') || 6379;
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    this.redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redisClient.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redisClient.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
      this.logger.log('Redis disconnected');
    }

    // Clean up pending debounce timers
    this.flushTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.flushTimeouts.clear();
  }

  /**
   * Yjs 문서를 Redis에 저장
   */
  async saveDocument(cardsetId: string, doc: Y.Doc): Promise<void> {
    try {
      // Redis 클라이언트가 초기화되지 않았으면 경고만 출력하고 계속 진행
      if (!this.redisClient) {
        this.logger.warn(
          `Redis client not initialized, skipping save for cardset ${cardsetId}`,
        );
        return;
      }

      const state = Y.encodeStateAsUpdate(doc);
      const key = `yjs:cardset:${cardsetId}`;
      await this.redisClient.set(key, Buffer.from(state));
      await this.redisClient.expire(key, 86400 * 7); // 7일 TTL
      this.logger.debug(`Saved Yjs document for cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error(
        `Failed to save document for cardset ${cardsetId}:`,
        error,
      );
      // Redis 저장 실패해도 에러를 throw하지 않고 계속 진행
      // (문서는 메모리에서 사용 가능)
    }
  }

  /**
   * Redis에서 Yjs 문서를 로드
   */
  async loadDocument(cardsetId: string): Promise<Y.Doc | null> {
    try {
      // Redis 클라이언트가 초기화되지 않았으면 null 반환
      if (!this.redisClient) {
        this.logger.warn(
          `Redis client not initialized for cardset ${cardsetId}`,
        );
        return null;
      }

      const key = `yjs:cardset:${cardsetId}`;
      this.logger.log(
        `[loadDocument] Cardset ${cardsetId} - Loading from Redis key: ${key}`,
      );
      const data = await this.redisClient.getBuffer(key);

      if (!data) {
        this.logger.log(
          `[loadDocument] Cardset ${cardsetId} - No data found in Redis`,
        );
        return null;
      }

      // Redis에서 로드한 바이너리 데이터 정보 로그
      this.logger.log(
        `[loadDocument] Cardset ${cardsetId} - Redis binary data size: ${data.length} bytes`,
      );
      this.logger.debug(
        `[loadDocument] Cardset ${cardsetId} - Redis binary data (first 100 bytes): ${Array.from(
          data.slice(0, 100),
        )
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ')}`,
      );

      const doc = new Y.Doc();
      Y.applyUpdate(doc, data);

      // Yjs 문서로 변환한 후의 내용 로그
      const docJson = doc;
      this.logger.log(
        `[loadDocument] Cardset ${cardsetId} - Yjs document content: ${JSON.stringify(docJson, null, 2)}`,
      );

      // Yjs 문서의 상태 업데이트 크기 로그
      const stateUpdate = Y.encodeStateAsUpdate(doc);
      this.logger.debug(
        `[loadDocument] Cardset ${cardsetId} - Yjs state update size: ${stateUpdate.length} bytes`,
      );

      this.logger.log(
        `[loadDocument] Cardset ${cardsetId} - Successfully loaded Yjs document from Redis`,
      );
      return doc;
    } catch (error) {
      this.logger.error(
        `Failed to load document for cardset ${cardsetId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Yjs 문서 업데이트를 Redis에 저장 (증분 업데이트)
   */
  async saveUpdate(cardsetId: string, update: Uint8Array): Promise<void> {
    try {
      // Redis 클라이언트가 초기화되지 않았으면 경고만 출력하고 계속 진행
      if (!this.redisClient) {
        this.logger.warn(
          `Redis client not initialized, skipping update save for cardset ${cardsetId}`,
        );
        return;
      }

      const key = `yjs:cardset:${cardsetId}`;
      const historyKey = `yjs:cardset:${cardsetId}:updates`;
      const updateBuffer = Buffer.from(update);
      const existingData = await this.redisClient.getBuffer(key);

      if (existingData) {
        // 기존 문서에 업데이트 적용
        const doc = new Y.Doc();
        Y.applyUpdate(doc, existingData);
        Y.applyUpdate(doc, update);
        const newState = Y.encodeStateAsUpdate(doc);
        await this.redisClient.set(key, Buffer.from(newState));
        await this.redisClient.expire(key, 86400 * 7);
      } else {
        // 문서가 없으면 새로 생성
        const doc = new Y.Doc();
        Y.applyUpdate(doc, update);
        const state = Y.encodeStateAsUpdate(doc);
        await this.redisClient.set(key, Buffer.from(state));
        await this.redisClient.expire(key, 86400 * 7);
      }

      // 증분 업데이트 내역을 별도 리스트로 보관
      await this.redisClient.rpush(historyKey, updateBuffer.toString('base64'));

      // 문서 업데이트가 일정 시간 동안 없으면 MySQL에 저장
      this.scheduleMySqlPersistence(cardsetId);
    } catch (error) {
      this.logger.error(
        `Failed to save update for cardset ${cardsetId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 디바운스 타이머를 설정하여 일정 시간 동안 업데이트가 없으면
   * Redis의 증분 업데이트 리스트를 MySQL에 자동 저장
   * @param cardsetId 카드셋 ID
   */
  private scheduleMySqlPersistence(cardsetId: string) {
    // 기존 타이머가 있으면 취소 (새로운 업데이트가 들어왔으므로)
    const existingTimeout = this.flushTimeouts.get(cardsetId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // 일정 시간 후 자동으로 MySQL에 저장 (isFlushed = false)
    const timeoutHandle = setTimeout(() => {
      void this.persistCardsetIncrementals(cardsetId, false);
    }, this.mysqlFlushDelayMs);

    this.flushTimeouts.set(cardsetId, timeoutHandle);
  }

  /**
   * 수동으로 증분 업데이트 리스트를 MySQL에 저장
   * 스냅샷 저장 시 호출되어 확정된 증분값으로 저장 (isFlushed = true)
   * @param cardsetId 카드셋 ID
   */
  async flushIncrementalHistory(cardsetId: string): Promise<void> {
    await this.persistCardsetIncrementals(cardsetId, true);
  }

  /**
   * Redis에 저장된 증분 업데이트 리스트를 MySQL cardset_incrementals 테이블에 저장
   * @param cardsetId 카드셋 ID
   * @param markAsFlushed true: 스냅샷과 함께 확정 저장, false: 자동 저장 (미확정)
   */
  private async persistCardsetIncrementals(
    cardsetId: string,
    markAsFlushed: boolean,
  ): Promise<void> {
    // 타이머 정리
    this.flushTimeouts.delete(cardsetId);

    const numericCardsetId = Number(cardsetId);
    if (Number.isNaN(numericCardsetId)) {
      this.logger.error(
        `Cannot persist cardset ${cardsetId} to MySQL: invalid numeric id`,
      );
      return;
    }

    const historyKey = `yjs:cardset:${cardsetId}:updates`;

    try {
      // Redis에서 증분 업데이트 리스트 조회
      if (!this.redisClient) {
        this.logger.error(
          `Redis client not initialized for cardset ${cardsetId}`,
        );
        return;
      }

      const updates = await this.redisClient.lrange(historyKey, 0, -1);
      if (updates.length === 0) {
        this.logger.debug(
          `No incremental updates to persist for cardset ${cardsetId}`,
        );
        return;
      }

      // base64로 저장된 증분값을 Buffer로 변환하여 엔티티 생성
      const entities = updates.map((base64Value) =>
        this.cardsetIncrementalRepository.create({
          cardset: { id: numericCardsetId } as Cardset,
          incrementalValue: Buffer.from(base64Value, 'base64'),
          isFlushed: markAsFlushed,
        }),
      );

      // MySQL에 저장
      await this.cardsetIncrementalRepository.save(entities);
      // 저장 완료 후 Redis 리스트 삭제
      await this.redisClient.del(historyKey);

      this.logger.log(
        `Persisted ${entities.length} incremental updates for cardset ${cardsetId} to MySQL`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist incremental updates for cardset ${cardsetId}:`,
        error,
      );
    }
  }

  /**
   * Redis에서 문서 삭제
   */
  async deleteDocument(cardsetId: string): Promise<void> {
    try {
      const key = `yjs:cardset:${cardsetId}`;
      await this.redisClient.del(key);

      const historyKey = `yjs:cardset:${cardsetId}:updates`;
      await this.redisClient.del(historyKey);

      this.logger.debug(`Deleted Yjs document for cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete document for cardset ${cardsetId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 카드셋에 클라이언트 등록 (Redis Set 사용)
   */
  async registerClient(cardsetId: string, clientId: string): Promise<void> {
    try {
      const cardsetKey = `yjs:cardset:${cardsetId}:clients`;
      const clientKey = `yjs:client:${clientId}:cardsets`;
      await Promise.all([
        this.redisClient.sadd(cardsetKey, clientId),
        this.redisClient.sadd(clientKey, cardsetId),
        this.redisClient.expire(cardsetKey, 86400), // 24시간 TTL
        this.redisClient.expire(clientKey, 86400),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to register client ${clientId} for cardset ${cardsetId}:`,
        error,
      );
    }
  }

  /**
   * 카드셋에서 클라이언트 해제 (Redis Set 사용)
   */
  async unregisterClient(cardsetId: string, clientId: string): Promise<void> {
    try {
      const cardsetKey = `yjs:cardset:${cardsetId}:clients`;
      const clientKey = `yjs:client:${clientId}:cardsets`;
      await Promise.all([
        this.redisClient.srem(cardsetKey, clientId),
        this.redisClient.srem(clientKey, cardsetId),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to unregister client ${clientId} from cardset ${cardsetId}:`,
        error,
      );
    }
  }

  /**
   * 카드셋의 활성 클라이언트 수 조회
   */
  async getActiveClientCount(cardsetId: string): Promise<number> {
    try {
      const cardsetKey = `yjs:cardset:${cardsetId}:clients`;
      return await this.redisClient.scard(cardsetKey);
    } catch (error) {
      this.logger.error(
        `Failed to get active client count for cardset ${cardsetId}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * 클라이언트가 참여 중인 모든 카드셋 조회
   */
  async getClientCardsets(clientId: string): Promise<string[]> {
    try {
      const clientKey = `yjs:client:${clientId}:cardsets`;
      return await this.redisClient.smembers(clientKey);
    } catch (error) {
      this.logger.error(
        `Failed to get cardsets for client ${clientId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * 클라이언트의 모든 카드셋에서 해제
   */
  async unregisterClientFromAllCardsets(clientId: string): Promise<void> {
    try {
      const cardsets = await this.getClientCardsets(clientId);
      const promises = cardsets.map((cardsetId) =>
        this.unregisterClient(cardsetId, clientId),
      );
      await Promise.all(promises);
    } catch (error) {
      this.logger.error(
        `Failed to unregister client ${clientId} from all cardsets:`,
        error,
      );
    }
  }
}
