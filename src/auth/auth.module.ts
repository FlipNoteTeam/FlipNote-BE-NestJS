import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WsAuthGuard } from './ws-auth.guard';
import authConfig from '../config/authConfig';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forFeature(authConfig)],
  controllers: [AuthController],
  providers: [AuthService, WsAuthGuard],
  exports: [AuthService, WsAuthGuard],
})
export class AuthModule {}
