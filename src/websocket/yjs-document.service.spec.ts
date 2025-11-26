import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { YjsDocumentService } from './yjs-document.service';
import { CardsetIncremental } from '../cardset/entities/cardset-incremental.entity';

describe('YjsDocumentService', () => {
  let service: YjsDocumentService;
  let repositoryMock: any;

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YjsDocumentService,
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
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<YjsDocumentService>(YjsDocumentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 실제 Redis 연결이 필요한 테스트는 test-yjs-integration.ts에서 실행
  // Jest 유닛 테스트는 서비스 구조만 확인
});

