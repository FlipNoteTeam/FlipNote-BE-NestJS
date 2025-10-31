import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { WsUser } from '../decorators/ws-user.decorator';
import type { UserAuth } from '../types/userAuth.type';

@UseGuards(WsAuthGuard) // 인증 가드 적용
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/cardsets',
  pingTimeout: 60000, // 60초
  pingInterval: 25000, // 25초
})
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private documentMap = new Map<string, Y.Doc>(); // cardsetId -> Y.Doc

  constructor() {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // 클라이언트가 연결된 모든 카드셋에서 나가기
    for (const [cardsetId, doc] of this.documentMap) {
      void client.leave(`cardset:${cardsetId}`);
    }
  }

  // 카드셋에 조인 (카드셋의 Yjs 문서에 접근)
  @SubscribeMessage('join-cardset')
  async handleJoinCardset(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string },
  ) {
    try {
      const { cardsetId } = data;
      this.logger.log(`User ${user.userId} joining cardset ${cardsetId}`);

      // 카드셋 룸에 조인
      void client.join(`cardset:${cardsetId}`);

      // 카드셋의 Yjs 문서 가져오기 또는 생성
      let doc = this.documentMap.get(cardsetId);
      if (!doc) {
        doc = new Y.Doc();
        this.documentMap.set(cardsetId, doc);
        this.logger.log(`Created new Yjs document for cardset ${cardsetId}`);
      }

      // 클라이언트에게 현재 카드셋 상태 전송
      const cards = doc.getArray('cards');
      client.emit('cardset-state', {
        cardsetId,
        cards: cards.toArray(),
      });

      this.logger.log(`User ${user.userId} joined cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error('Error joining cardset:', error);
      client.emit('error', { message: 'Failed to join cardset' });
    }
  }

  // 카드셋에서 나가기
  @SubscribeMessage('leave-cardset')
  async handleLeaveCardset(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string },
  ) {
    try {
      const { cardsetId } = data;
      this.logger.log(`User ${user.userId} leaving cardset ${cardsetId}`);

      void client.leave(`cardset:${cardsetId}`);
      this.logger.log(`User ${user.userId} left cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error('Error leaving cardset:', error);
    }
  }


  // 카드 업데이트
  @SubscribeMessage('update-card')
  async handleUpdateCard(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string; cardId: string; updates: Partial<{ content: string; order: number }> },
  ) {
    try {
      const { cardsetId, cardId, updates } = data;
      this.logger.log(`User ${user.userId} updating card ${cardId} in cardset ${cardsetId}`);

      const doc = this.documentMap.get(cardsetId);
      if (!doc) {
        client.emit('error', { message: 'Cardset not found' });
        return;
      }

      const cards = doc.getArray('cards');
      const cardsArray = cards.toArray();
      const cardIndex = cardsArray.findIndex((card: any) => card.id === cardId);
      
      if (cardIndex === -1) {
        client.emit('error', { message: 'Card not found' });
        return;
      }

      const currentCard = cardsArray[cardIndex] as any;
      const updatedCard = {
        ...currentCard,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      cards.delete(cardIndex, 1);
      cards.insert(cardIndex, [updatedCard]);

      this.logger.log(`Card ${cardId} updated in cardset ${cardsetId}`);
    } catch (error) {
      this.logger.error('Error updating card:', error);
      client.emit('error', { message: 'Failed to update card' });
    }
  }


  // Yjs 동기화 (클라이언트가 변경사항을 받을 때)
  @SubscribeMessage('sync')
  async handleSync(
    @WsUser() user: UserAuth,
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { cardsetId: string; syncStep: number; update?: number[] },
  ) {
    try {
      const { cardsetId, syncStep, update } = data;
      this.logger.log(`Sync request from user ${user.userId} for cardset ${cardsetId}`);

      const doc = this.documentMap.get(cardsetId);
      if (!doc) {
        client.emit('error', { message: 'Cardset not found' });
        return;
      }

      if (update) {
        // 클라이언트에서 온 업데이트 적용
        Y.applyUpdate(doc, new Uint8Array(update));
      }

      // 현재 상태를 클라이언트에게 전송
      const state = Y.encodeStateAsUpdate(doc);
      client.emit('sync-response', {
        cardsetId,
        update: Array.from(state),
      });
    } catch (error) {
      this.logger.error('Error during sync:', error);
      client.emit('error', { message: 'Sync failed' });
    }
  }
}