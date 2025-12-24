import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CardsetService } from './cardset.service';
import { successResponse } from '../common/utils/response.util';

@Controller('card-sets')
export class CardsetController {
  constructor(private readonly cardsetService: CardsetService) {}

  @Post(':cardSetId')
  async saveCardsetContent(
    @Param('cardSetId', ParseIntPipe) cardSetId: number,
  ) {
    await this.cardsetService.saveCardsetContent(cardSetId);
    return successResponse({ success: true }, 200, '저장을 성공했습니다');
  }

  @Get(':cardSetId/cards')
  async getCardsetInCards(@Param('cardSetId', ParseIntPipe) cardSetId: number) {
    const cards = await this.cardsetService.getCardsetInCards(cardSetId);
    return successResponse(cards, 200, '조회를 성공했습니다');
  }
}
