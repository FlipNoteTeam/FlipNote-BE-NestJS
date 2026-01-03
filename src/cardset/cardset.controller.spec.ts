import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CardsetController } from './cardset.controller';
import { CardsetService } from './cardset.service';
import { Cardset } from './entities/cardset.entity';
import { CardsetContent } from './entities/cardset-content.entity';
import { YjsDocumentService } from '../websocket/yjs-document.service';
import { CardsetIncremental } from './entities/cardset-incremental.entity';

describe('CardsetController', () => {
  let controller: CardsetController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardsetController],
      providers: [
        CardsetService,
        YjsDocumentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Cardset),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CardsetContent),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CardsetIncremental),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CardsetController>(CardsetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
