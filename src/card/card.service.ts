import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card } from './entities/card.entity';

@Injectable()
export class CardService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
  ) {}

  async findByCardsetId(cardsetId: number): Promise<Card[]> {
    return this.cardRepository.find({
      where: { cardSetId: cardsetId },
      order: { id: 'ASC' },
    });
  }
}
