import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsetService } from './cardset.service';
import { CardsetController } from './cardset.controller';
import { Cardset } from './entities/cardset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cardset])],
  controllers: [CardsetController],
  providers: [CardsetService],
  exports: [CardsetService],
})
export class CardsetModule {}
