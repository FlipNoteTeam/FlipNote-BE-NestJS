import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cardset } from './entities/cardset.entity';

@Injectable()
export class CardsetService {
  constructor(
    @InjectRepository(Cardset)
    private readonly cardsetRepository: Repository<Cardset>,
  ) {}

  async findOne(id: number): Promise<Cardset | null> {
    return this.cardsetRepository.findOne({ where: { id } });
  }
}
