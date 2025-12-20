import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CollaborationGateway } from './websocket.gateway';
import { YjsDocumentService } from './yjs-document.service';
import { CardsetService } from '../cardset/cardset.service';
import { AuthService } from '../auth/auth.service';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { CardsetIncremental } from '../cardset/entities/cardset-incremental.entity';
import { Cardset } from '../cardset/entities/cardset.entity';
import { CardsetContent } from '../cardset/entities/cardset-content.entity';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import type { UserAuth } from '../types/userAuth.type';
import authConfig from '../config/authConfig';

describe('CollaborationGateway Integration', () => {
  let gateway: CollaborationGateway;
  let yjsDocumentService: YjsDocumentService;
  let cardsetService: CardsetService;
  let mockSocket: Partial<Socket>;
  let mockServer: Partial<Server>;
  let mockRedisClient: {
    getBuffer: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    expire: jest.Mock;
    rpush: jest.Mock;
    lrange: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    scard: jest.Mock;
    smembers: jest.Mock;
    on: jest.Mock;
  };

  beforeEach(async () => {
    mockSocket = {
      id: 'test-client-1',
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
    };

    mockServer = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    };

    mockRedisClient = {
      getBuffer: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
      rpush: jest.fn(),
      lrange: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      scard: jest.fn(),
      smembers: jest.fn(),
      on: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaborationGateway,
        YjsDocumentService,
        CardsetService,
        AuthService,
        WsAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return 6379;
              if (key === 'YJS_MYSQL_FLUSH_DELAY_MS') return 1000;
              return null;
            }),
          },
        },
        {
          provide: authConfig.KEY,
          useValue: {
            jwtSecret: 'test-secret',
          },
        },
        {
          provide: getRepositoryToken(CardsetIncremental),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Cardset),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CardsetContent),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<CollaborationGateway>(CollaborationGateway);
    yjsDocumentService = module.get<YjsDocumentService>(YjsDocumentService);
    cardsetService = module.get<CardsetService>(CardsetService);

    gateway.server = mockServer as Server;

    // Redis 클라이언트 모킹
    (yjsDocumentService as unknown as { redisClient: unknown }).redisClient =
      mockRedisClient;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
    expect(yjsDocumentService).toBeDefined();
    expect(cardsetService).toBeDefined();
  });

  describe('join-cardset flow', () => {
    it('should load document from Redis when available', async () => {
      const cardsetId = '1';
      const user: UserAuth = {
        userId: 'user-1',
        role: 'user',
        tokenVersion: 1,
      };

      // Redis에 문서 저장 모킹
      const doc = new Y.Doc();
      const testArray = doc.getArray('test');
      testArray.push(['data1']);
      const state = Y.encodeStateAsUpdate(doc);
      mockRedisClient.getBuffer.mockResolvedValue(Buffer.from(state));
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);

      // join-cardset 호출
      await gateway.handleJoinCardset(user, mockSocket as Socket, {
        cardsetId,
      });

      expect(mockSocket.join).toHaveBeenCalledWith(`cardset:${cardsetId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('sync', expect.any(Object));
    });

    it('should load from DB when Redis is empty', async () => {
      const cardsetId = '2';
      const numericId = 2;
      const user: UserAuth = {
        userId: 'user-2',
        role: 'user',
        tokenVersion: 1,
      };

      // Redis가 비어있음을 모킹
      mockRedisClient.getBuffer.mockResolvedValue(null);

      // DB에서 로드하는 메서드 모킹
      const dbDoc = new Y.Doc();
      const dbArray = dbDoc.getArray('db-data');
      dbArray.push(['from-db']);
      const loadFromDBSpy = jest
        .spyOn(cardsetService, 'loadCardsetContentFromDB')
        .mockResolvedValue(dbDoc);

      await gateway.handleJoinCardset(user, mockSocket as Socket, {
        cardsetId,
      });

      expect(loadFromDBSpy).toHaveBeenCalledWith(numericId);
      expect(mockSocket.emit).toHaveBeenCalledWith('sync', expect.any(Object));
    });

    it('should create new document when both Redis and DB are empty', async () => {
      const cardsetId = '3';
      const user: UserAuth = {
        userId: 'user-3',
        role: 'user',
        tokenVersion: 1,
      };

      // Redis가 비어있음을 모킹
      mockRedisClient.getBuffer.mockResolvedValue(null);

      // DB에서도 null 반환
      jest
        .spyOn(cardsetService, 'loadCardsetContentFromDB')
        .mockResolvedValue(null);

      await gateway.handleJoinCardset(user, mockSocket as Socket, {
        cardsetId,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('sync', expect.any(Object));
    });
  });

  describe('update flow', () => {
    it('should apply update and broadcast to all clients', async () => {
      const cardsetId = '1';
      const user: UserAuth = {
        userId: 'user-4',
        role: 'user',
        tokenVersion: 1,
      };

      // 문서 생성 및 유효한 업데이트 생성
      const doc = new Y.Doc();
      const testArray = doc.getArray('test');
      testArray.push(['initial']);
      const initialState = Y.encodeStateAsUpdate(doc);

      // 업데이트 적용
      const updateDoc = new Y.Doc();
      Y.applyUpdate(updateDoc, initialState);
      updateDoc.getArray('test').push(['new-item']);
      const update = Y.encodeStateAsUpdate(updateDoc);

      // Redis 모킹
      mockRedisClient.getBuffer.mockResolvedValue(Buffer.from(initialState));
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.rpush.mockResolvedValue(1);

      const updateArray = Array.from(update);

      const mockEmit = jest.fn();
      (mockServer.to as jest.Mock).mockReturnValue({
        emit: mockEmit,
      });

      await gateway.handleUpdate(user, mockSocket as Socket, {
        cardsetId,
        update: updateArray,
      });

      expect(mockServer.to).toHaveBeenCalledWith(`cardset:${cardsetId}`);
      expect(mockEmit).toHaveBeenCalledWith('sync', expect.any(Object));
    });
  });
});
