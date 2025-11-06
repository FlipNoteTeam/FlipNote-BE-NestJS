import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as Y from 'yjs';

@Injectable()
export class YjsDocumentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YjsDocumentService.name);
  private redisClient: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
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
  }

  /**
   * Yjs 문서를 Redis에 저장
   */
  async saveDocument(cardsetId: string, doc: Y.Doc): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(doc);
      const key = `yjs:cardset:${cardsetId}`;
      await this.redisClient.set(key, Buffer.from(state));
      await this.redisClient.expire(key, 86400 * 7); // 7일 TTL
      this.logger.debug(`Saved Yjs document for cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error(`Failed to save document for cardset ${cardsetId}:`, error);
      throw error;
    }
  }

  /**
   * Redis에서 Yjs 문서를 로드
   */
  async loadDocument(cardsetId: string): Promise<Y.Doc | null> {
    try {
      const key = `yjs:cardset:${cardsetId}`;
      const data = await this.redisClient.getBuffer(key);
      
      if (!data) {
        return null;
      }

      const doc = new Y.Doc();
      Y.applyUpdate(doc, data);
      this.logger.debug(`Loaded Yjs document for cardset ${cardsetId}`);
      return doc;
    } catch (error) {
      this.logger.error(`Failed to load document for cardset ${cardsetId}:`, error);
      return null;
    }
  }

  /**
   * Yjs 문서 업데이트를 Redis에 저장 (증분 업데이트)
   */
  async saveUpdate(cardsetId: string, update: Uint8Array): Promise<void> {
    try {
      const key = `yjs:cardset:${cardsetId}`;
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
    } catch (error) {
      this.logger.error(`Failed to save update for cardset ${cardsetId}:`, error);
      throw error;
    }
  }

  /**
   * Redis에서 문서 삭제
   */
  async deleteDocument(cardsetId: string): Promise<void> {
    try {
      const key = `yjs:cardset:${cardsetId}`;
      await this.redisClient.del(key);
      this.logger.debug(`Deleted Yjs document for cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error(`Failed to delete document for cardset ${cardsetId}:`, error);
      throw error;
    }
  }
}

