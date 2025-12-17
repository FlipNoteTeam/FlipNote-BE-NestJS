import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Y from 'yjs';
import { Cardset } from './entities/cardset.entity';
import { CardsetContent } from './entities/cardset-content.entity';
import { YjsDocumentService } from '../websocket/yjs-document.service';

@Injectable()
export class CardsetService {
  private readonly logger = new Logger(CardsetService.name);

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
   * Yjs 배열에서 카드 데이터를 추출하여 객체 배열로 변환
   * @param cardsArray Yjs 배열
   * @returns 카드 객체 배열 [{question: string, answer: string}, ...]
   */
  private extractCardsFromYjsArray(
    cardsArray: Y.Array<unknown>,
  ): Array<{ question: string; answer: string }> {
    return cardsArray.map((cardMap) => {
      const questionText = (cardMap as Y.Map<unknown>)?.get('question') as
        | Y.Text
        | undefined;
      const answerText = (cardMap as Y.Map<unknown>)?.get('answer') as
        | Y.Text
        | undefined;

      const question = questionText ? (questionText as unknown as string) : '';
      const answer = answerText ? (answerText as unknown as string) : '';

      return {
        question,
        answer,
      };
    });
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
        this.logger.log(
          `[loadCardsetContentFromDB] Cardset ${cardSetId}: No content found`,
        );
        return null;
      }

      // 원본 JSON 문자열 로그
      this.logger.log(
        `[loadCardsetContentFromDB] Cardset ${cardSetId} - Original content: ${cardsetContent.content.substring(0, 200)}${cardsetContent.content.length > 200 ? '...' : ''}`,
      );

      // JSON 문자열을 파싱
      const jsonContent = JSON.parse(cardsetContent.content) as Record<
        string,
        unknown
      >;

      // 파싱된 JSON 내용 로그
      this.logger.log(
        `[loadCardsetContentFromDB] Cardset ${cardSetId} - Parsed JSON: ${JSON.stringify(jsonContent, null, 2)}`,
      );

      // Y.Doc 생성 및 JSON 데이터 적용
      const doc = new Y.Doc();
      if (jsonContent && typeof jsonContent === 'object') {
        // Y.Doc에 JSON 데이터 적용
        // Yjs는 Map이나 Array 같은 구조화된 데이터를 사용하므로
        // 일반 JSON 객체를 Y.Map에 저장
        const yMap = doc.getMap('content');
        for (const [key, value] of Object.entries(jsonContent)) {
          yMap.set(key, value);
          this.logger.debug(
            `[loadCardsetContentFromDB] Cardset ${cardSetId} - Set Y.Map key: ${key}, value: ${JSON.stringify(value)}`,
          );
        }
      }

      this.logger.log(
        `[loadCardsetContentFromDB] Cardset ${cardSetId} - Successfully loaded and converted to Y.Doc`,
      );

      return doc;
    } catch (error) {
      // 테이블이 없거나 조회 실패 시 null 반환 (에러 throw 안 함)
      this.logger.error(
        `[loadCardsetContentFromDB] Cardset ${cardSetId} - Error loading content: ${error instanceof Error ? error.message : String(error)}`,
      );
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

    const cardsArray = doc.getArray('cards');

    // 카드 배열을 객체 배열로 변환
    const cardsList = this.extractCardsFromYjsArray(cardsArray);

    // 배열을 문자열로 변환
    const cardsListString = JSON.stringify(cardsList);
    this.logger.log(
      `[saveCardsetContent] Cardset ${cardSetId} - Cards list: ${cardsListString}`,
    );

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

    //카드셋 내용 저장
    cardsetContent.content = cardsListString;

    await this.cardsetContentRepository.save(cardsetContent);

    await this.yjsDocumentService.flushIncrementalHistory(cardSetId.toString());
  }
}
