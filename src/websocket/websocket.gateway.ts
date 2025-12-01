import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, Logger, UseGuards, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { WsUser } from '../decorators/ws-user.decorator';
import type { UserAuth } from '../types/userAuth.type';
import { YjsDocumentService } from './yjs-document.service';
import { CardsetService } from '../cardset/cardset.service';

@UseGuards(WsAuthGuard) // 인증 가드 적용
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/cardsets',
  pingTimeout: 60000, // 60초
  pingInterval: 25000, // 25초
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private static readonly FLUSH_DELAY_MS = 5000;

  private readonly logger = new Logger(CollaborationGateway.name);
  private flushTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly yjsDocumentService: YjsDocumentService,
    @Inject(forwardRef(() => CardsetService))
    private readonly cardsetService: CardsetService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    await this.removeClientFromAllCardsets(client);
  }

  // 카드셋에 조인 (카드셋의 Yjs 문서에 접근)
  @SubscribeMessage('join-cardset')
  async handleJoinCardset(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string },
  ) {
    const { cardsetId } = data;
    this.logger.log(`User ${user.userId} joining cardset ${cardsetId}`);

    try {
      // 카드셋 룸에 조인
      void client.join(`cardset:${cardsetId}`);

      // TODO: 카드셋 룸에 조인 시 클라이언트 등록 및 플러시 스케줄링 기능
      // await this.yjsDocumentService.registerClient(cardsetId, client.id);
      // this.clearScheduledFlush(cardsetId);

      // Redis에서 문서 로드 시도
      let doc = await this.yjsDocumentService.loadDocument(cardsetId);
      if (!doc) {
        // Redis에 없으면 DB에서 확인
        doc = await this.loadDocumentFromDBOrCreate(cardsetId);
      }

      // 문서가 없으면 새로 생성 (최후의 수단)
      if (!doc) {
        this.logger.warn(
          `Failed to load or create document for cardset ${cardsetId}, creating empty document`,
        );
        doc = new Y.Doc();
      }

      // 클라이언트에게 현재 카드셋 상태 전송 -> 직렬화
      const state = Y.encodeStateAsUpdate(doc);

      client.emit('sync', {
        cardsetId,
        update: Array.from(state),
      });

      this.logger.log(`User ${user.userId} joined cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error('Error joining cardset:', error);
      this.logger.error('Error details:', {
        cardsetId,
        userId: user?.userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });

      // 에러가 발생해도 빈 문서라도 보내서 클라이언트가 연결 유지할 수 있도록
      try {
        const emptyDoc = new Y.Doc();
        const state = Y.encodeStateAsUpdate(emptyDoc);
        client.emit('sync', {
          cardsetId,
          update: Array.from(state),
        });
        this.logger.warn(
          `Sent empty document to client due to error for cardset ${cardsetId}`,
        );
      } catch (fallbackError) {
        this.logger.error('Failed to send fallback document:', fallbackError);
        client.emit('error', {
          message: 'Failed to join cardset',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 카드셋에서 나가기
  @SubscribeMessage('leave-cardset')
  handleLeaveCardset(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string },
  ) {
    try {
      const { cardsetId } = data;
      this.logger.log(`User ${user.userId} leaving cardset ${cardsetId}`);

      void client.leave(`cardset:${cardsetId}`);
      // await this.yjsDocumentService.unregisterClient(cardsetId, client.id);
      // const activeCount =
      //   await this.yjsDocumentService.getActiveClientCount(cardsetId);
      // if (activeCount === 0) {
      //   this.scheduleFlush(cardsetId);
      // }
      this.logger.log(`User ${user.userId} left cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error('Error leaving cardset:', error);
    }
  }

  @SubscribeMessage('awareness') // ← 클라이언트가 보낸 "awareness" 받음
  handleAwareness(
    client: Socket,
    payload: { cardsetId: string; awareness: Uint8Array },
  ) {
    const { cardsetId, awareness } = payload;

    // 같은 문서에 있는 클라이언트에 "awareness"로 브로드캐스트
    client.to(cardsetId).emit('awareness', {
      data: { cardsetId, awareness: new Uint8Array(awareness) },
    });
  }

  // Yjs 업데이트 (클라이언트가 변경사항을 받을 때)
  @SubscribeMessage('update')
  async handleUpdate(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string; update?: number[] },
  ) {
    try {
      const { cardsetId, update } = data;
      this.logger.log(
        `Sync request from user ${user.userId} for cardset ${cardsetId}`,
      );

      if (!update) {
        client.emit('error', { message: 'Update data is required' });
        return;
      }

      // Redis에서 문서 로드
      let doc = await this.yjsDocumentService.loadDocument(cardsetId);
      if (!doc) {
        doc = new Y.Doc();
        this.logger.log(
          `Created new Yjs document for cardset ${cardsetId} during update`,
        );
      }

      // 클라이언트에서 온 업데이트 적용 -> 증분값
      const updateBuffer = new Uint8Array(update);
      Y.applyUpdate(doc, updateBuffer);

      // Redis에 업데이트 저장 (증분값과 스냅샷 모두 저장)
      await this.yjsDocumentService.saveUpdate(cardsetId, updateBuffer);

      // 업데이트 적용 후 모든 클라이언트에게 sync 브로드캐스트
      const state = Y.encodeStateAsUpdate(doc);
      this.server.to(`cardset:${cardsetId}`).emit('sync', {
        cardsetId,
        update: state,
      });
      this.logger.log(
        `Sync update from user ${user.userId} broadcasted to all clients in cardset ${cardsetId}`,
      );
    } catch (error) {
      this.logger.error('Error during sync:', error);
      client.emit('error', { message: 'Sync failed' });
    }
  }

  /**
   * DB에서 문서를 로드하거나 없으면 새로 생성
   * DB에서 로드한 경우 Redis에 저장
   */
  private async loadDocumentFromDBOrCreate(cardsetId: string): Promise<Y.Doc> {
    const numericCardsetId = Number(cardsetId);

    try {
      // DB에서 로드 시도
      const doc =
        await this.cardsetService.loadCardsetContentFromDB(numericCardsetId);
      if (doc) {
        // DB에서 로드한 문서를 Redis에 저장 (실패해도 계속 진행)
        await this.yjsDocumentService.saveDocument(cardsetId, doc).catch(
          (error) => {
            this.logger.warn(
              `Failed to save document to Redis after DB load: ${error}`,
            );
          },
        );
        this.logger.log(
          `Loaded Yjs document from DB and saved to Redis for cardset ${cardsetId}`,
        );
        return doc;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load from DB for cardset ${cardsetId}, creating new document: ${error}`,
      );
    }

    // DB에도 없거나 에러 발생 시 새로 생성
    return this.createNewDocument(cardsetId);
  }

  /**
   * 새 Yjs 문서를 생성하고 Redis에 저장
   */
  private async createNewDocument(cardsetId: string): Promise<Y.Doc> {
    const doc = new Y.Doc();
    this.logger.log(`Created new Yjs document for cardset ${cardsetId}`);
    // Redis 저장 실패해도 문서는 반환 (메모리에서 사용 가능)
    await this.yjsDocumentService.saveDocument(cardsetId, doc).catch(
      (error) => {
        this.logger.warn(
          `Failed to save new document to Redis: ${error}, continuing anyway`,
        );
      },
    );
    return doc;
  }

  private async removeClientFromAllCardsets(client: Socket) {
    const cardsets = await this.yjsDocumentService.getClientCardsets(client.id);
    if (cardsets.length === 0) {
      return;
    }
    for (const cardsetId of cardsets) {
      void client.leave(`cardset:${cardsetId}`);
      await this.yjsDocumentService.unregisterClient(cardsetId, client.id);
      const activeCount =
        await this.yjsDocumentService.getActiveClientCount(cardsetId);
      if (activeCount === 0) {
        this.scheduleFlush(cardsetId);
      }
    }
  }

  private scheduleFlush(cardsetId: string) {
    if (this.flushTimeouts.has(cardsetId)) {
      return;
    }
    const timeout = setTimeout(() => {
      this.flushTimeouts.delete(cardsetId);
      void this.flushCardset(cardsetId);
    }, CollaborationGateway.FLUSH_DELAY_MS);
    this.flushTimeouts.set(cardsetId, timeout);
    this.logger.log(`Scheduled cardset ${cardsetId} flush`);
  }

  private clearScheduledFlush(cardsetId: string) {
    const timeout = this.flushTimeouts.get(cardsetId);
    if (timeout) {
      clearTimeout(timeout);
      this.flushTimeouts.delete(cardsetId);
    }
  }

  private async flushCardset(cardsetId: string) {
    const activeCount =
      await this.yjsDocumentService.getActiveClientCount(cardsetId);
    if (activeCount > 0) {
      return;
    }
    try {
      await this.cardsetService.saveCardsetContent(Number(cardsetId));
      this.logger.log(`Flushed cardset ${cardsetId} snapshot to database`);
    } catch (error) {
      this.logger.error(`Failed to flush cardset ${cardsetId}:`, error);
    }
  }
}
