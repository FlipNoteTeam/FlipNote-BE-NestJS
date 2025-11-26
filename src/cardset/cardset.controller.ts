import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CardsetService } from './cardset.service';

@Controller('v1/card-sets')
export class CardsetController {
  constructor(private readonly cardsetService: CardsetService) {}

  @Post(':cardSetId')
  async saveCardsetSnapshot(
    @Param('cardSetId', ParseIntPipe) cardSetId: number,
  ) {
    await this.cardsetService.saveCardsetContent(cardSetId);
    return { success: true };
  }
}
