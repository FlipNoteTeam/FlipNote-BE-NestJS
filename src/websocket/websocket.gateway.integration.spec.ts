import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CollaborationGateway } from './websocket.gateway';
import { YjsDocumentService } from './yjs-document.service';
import { CardsetService } from '../cardset/cardset.service';
import { CardsetIncremental } from '../cardset/entities/cardset-incremental.entity';
import { Cardset } from '../cardset/entities/cardset.entity';
import { CardsetContent } from '../cardset/entities/cardset-content.entity';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';

describe('CollaborationGateway Integration', () => {
  let gateway: CollaborationGateway;
  let yjsDocumentService: YjsDocumentService;
  let cardsetService: CardsetService;
  let mockSocket: Partial<Socket>;
  let mockServer: Partial<Server>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaborationGateway,
        YjsDocumentService,
        CardsetService,
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
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
    expect(yjsDocumentService).toBeDefined();
    expect(cardsetService).toBeDefined();
  });

  describe('join-cardset flow', () => {
    it('should load document from Redis when available', async () => {
      const cardsetId = 'test-join-1';
      const user = { userId: 'user-1' };

      // Redis에 문서 저장
      const doc = new Y.Doc();
      const testArray = doc.getArray('test');
      testArray.push(['data1']);
      await yjsDocumentService.saveDocument(cardsetId, doc);

      // join-cardset 호출
      await gateway.handleJoinCardset(
        user as any,
        mockSocket as Socket,
        { cardsetId },
      );

      expect(mockSocket.join).toHaveBeenCalledWith(`cardset:${cardsetId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('sync', expect.any(Object));

      // 정리
      await yjsDocumentService.deleteDocument(cardsetId);
    });

    it('should load from DB when Redis is empty', async () => {
      const cardsetId = 'test-join-2';
      const numericId = 2;
      const user = { userId: 'user-2' };

      // DB에서 로드하는 메서드 모킹
      const dbDoc = new Y.Doc();
      const dbArray = dbDoc.getArray('db-data');
      dbArray.push(['from-db']);
      jest
        .spyOn(cardsetService, 'loadCardsetContentFromDB')
        .mockResolvedValue(dbDoc);

      await gateway.handleJoinCardset(
        user as any,
        mockSocket as Socket,
        { cardsetId },
      );

      expect(cardsetService.loadCardsetContentFromDB).toHaveBeenCalledWith(
        numericId,
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('sync', expect.any(Object));

      // 정리
      await yjsDocumentService.deleteDocument(cardsetId);
    });

    it('should create new document when both Redis and DB are empty', async () => {
      const cardsetId = 'test-join-3';
      const user = { userId: 'user-3' };

      // DB에서도 null 반환
      jest
        .spyOn(cardsetService, 'loadCardsetContentFromDB')
        .mockResolvedValue(null);

      await gateway.handleJoinCardset(
        user as any,
        mockSocket as Socket,
        { cardsetId },
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('sync', expect.any(Object));

      // 정리
      await yjsDocumentService.deleteDocument(cardsetId);
    });
  });

  describe('update flow', () => {
    it('should apply update and broadcast to all clients', async () => {
      const cardsetId = 'test-update-1';
      const user = { userId: 'user-4' };

      // 문서 생성
      const doc = new Y.Doc();
      await yjsDocumentService.saveDocument(cardsetId, doc);

      // 업데이트 데이터
      const update = new Uint8Array([1, 2, 3, 4, 5]);
      const updateArray = Array.from(update);

      await gateway.handleUpdate(
        user as any,
        mockSocket as Socket,
        { cardsetId, update: updateArray },
      );

      expect(mockServer.to).toHaveBeenCalledWith(`cardset:${cardsetId}`);
      expect(mockServer.to().emit).toHaveBeenCalledWith(
        'sync',
        expect.any(Object),
      );

      // 정리
      await yjsDocumentService.deleteDocument(cardsetId);
    });
  });
});

