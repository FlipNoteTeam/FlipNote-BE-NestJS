import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaborationGateway } from './websocket.gateway';
import { YjsDocumentService } from './yjs-document.service';
import { AuthModule } from '../auth/auth.module';
import { CardsetModule } from '../cardset/cardset.module';
import { CardsetIncremental } from '../cardset/entities/cardset-incremental.entity';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => CardsetModule),
    TypeOrmModule.forFeature([CardsetIncremental]),
  ],
  providers: [CollaborationGateway, YjsDocumentService],
  exports: [YjsDocumentService],
})
export class WebSocketModule {}
