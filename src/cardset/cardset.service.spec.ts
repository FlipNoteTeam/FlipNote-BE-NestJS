import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CardsetService } from './cardset.service';
import { Cardset } from './entities/cardset.entity';
import { CardsetContent } from './entities/cardset-content.entity';
import { YjsDocumentService } from '../websocket/yjs-document.service';

describe('CardsetService', () => {
  let service: CardsetService;

  const repositoryMockFactory = () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  });

  let cardsetRepositoryMock: ReturnType<typeof repositoryMockFactory>;
  let cardsetContentRepositoryMock: ReturnType<typeof repositoryMockFactory>;
  let yjsDocumentServiceMock: { loadDocument: jest.Mock };

  beforeEach(async () => {
    cardsetRepositoryMock = repositoryMockFactory();
    cardsetContentRepositoryMock = repositoryMockFactory();
    yjsDocumentServiceMock = {
      loadDocument: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsetService,
        {
          provide: getRepositoryToken(Cardset),
          useValue: cardsetRepositoryMock,
        },
        {
          provide: getRepositoryToken(CardsetContent),
          useValue: cardsetContentRepositoryMock,
        },
        {
          provide: YjsDocumentService,
          useValue: yjsDocumentServiceMock,
        },
      ],
    }).compile();

    service = module.get<CardsetService>(CardsetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
