import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsetService } from './cardset.service';
import { CardsetController } from './cardset.controller';
import { Cardset } from './entities/cardset.entity';
import { CardsetContent } from './entities/cardset-content.entity';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cardset, CardsetContent]),
    forwardRef(() => WebSocketModule),
  ],
  controllers: [CardsetController],
  providers: [CardsetService],
  exports: [CardsetService],
})
export class CardsetModule {}
