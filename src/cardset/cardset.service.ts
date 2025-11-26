import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Y from 'yjs';
import { Cardset } from './entities/cardset.entity';
import { CardsetContent } from './entities/cardset-content.entity';
import { YjsDocumentService } from '../websocket/yjs-document.service';

@Injectable()
export class CardsetService {
  constructor(
    @InjectRepository(Cardset)
    private readonly cardsetRepository: Repository<Cardset>,
    @InjectRepository(CardsetContent)
    private readonly cardsetContentRepository: Repository<CardsetContent>,
    private readonly yjsDocumentService: YjsDocumentService,
  ) {}

  async findOne(id: number): Promise<Cardset | null> {
    return this.cardsetRepository.findOne({ where: { id } });
  }

  /**
   * DB에서 카드셋 내용을 로드하여 Y.Doc으로 변환
   * @param cardSetId 카드셋 ID
   * @returns Y.Doc 객체 또는 null (DB에 없으면)
   */
  async loadCardsetContentFromDB(cardSetId: number): Promise<Y.Doc | null> {
    try {
      const cardsetContent = await this.cardsetContentRepository.findOne({
        where: { cardset: { id: cardSetId } },
      });

      if (!cardsetContent || !cardsetContent.content) {
        return null;
      }

      // JSON 문자열을 파싱
      const jsonContent = JSON.parse(cardsetContent.content) as Record<
        string,
        unknown
      >;

      // Y.Doc 생성 및 JSON 데이터 적용
      const doc = new Y.Doc();
      if (jsonContent && typeof jsonContent === 'object') {
        // Y.Doc에 JSON 데이터 적용
        // Yjs는 Map이나 Array 같은 구조화된 데이터를 사용하므로
        // 일반 JSON 객체를 Y.Map에 저장
        const yMap = doc.getMap('content');
        for (const [key, value] of Object.entries(jsonContent)) {
          yMap.set(key, value);
        }
      }

      return doc;
    } catch (error) {
      // 테이블이 없거나 조회 실패 시 null 반환 (에러 throw 안 함)
      return null;
    }
  }

  async saveCardsetContent(cardSetId: number): Promise<void> {
    //카드셋 없으면 에러 발생
    const cardset = await this.cardsetRepository.findOne({
      where: { id: cardSetId },
    });
    if (!cardset) {
      throw new NotFoundException('Cardset not found');
    }

    //레디스에서 카드셋 스냅샷 로드
    const doc = await this.yjsDocumentService.loadDocument(
      cardSetId.toString(),
    );
    if (!doc) {
      throw new NotFoundException('Cardset snapshot not found in Redis');
    }

    const jsonContent = JSON.stringify(doc.toJSON() ?? {});

    //카드셋 내용 없으면 새로 생성
    let cardsetContent = await this.cardsetContentRepository.findOne({
      where: { cardset: { id: cardSetId } },
    });

    //카드셋 내용 없으면 새로 생성
    if (!cardsetContent) {
      cardsetContent = this.cardsetContentRepository.create({
        cardset,
        content: '',
      });
    }

    cardsetContent.content = jsonContent;

    await this.cardsetContentRepository.save(cardsetContent);

    await this.yjsDocumentService.flushIncrementalHistory(cardSetId.toString());
  }
}
