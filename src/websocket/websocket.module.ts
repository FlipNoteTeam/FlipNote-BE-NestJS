import { Module } from '@nestjs/common';
import { CollaborationGateway } from './websocket.gateway';
import { YjsDocumentService } from './yjs-document.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [CollaborationGateway, YjsDocumentService],
  exports: [YjsDocumentService],
})
export class WebSocketModule {}
