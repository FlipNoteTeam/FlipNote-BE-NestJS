import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CardsetModule } from './cardset/cardset.module';
import { CardsetManagerModule } from './cardset-manager/cardset-manager.module';
import { Cardset as CardSet } from './cardset/entities/cardset.entity';
import { CardsetSnapshot } from './cardset/entities/cardset-snapshot.entity';
import { CardsetIncremental } from './cardset/entities/cardset-incremental.entity';
import { CardsetContent } from './cardset/entities/cardset-content.entity';
import { CardsetManager as CardSetManager } from './cardset-manager/entities/cardset-manager.entity';
import { CardModule } from './card/card.module';
import { Card as Card } from './card/entities/card.entity';
import { WebSocketModule } from './websocket/websocket.module';
@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [
        CardSet,
        CardsetSnapshot,
        CardsetIncremental,
        CardsetContent,
        CardSetManager,
        Card,
      ],
      synchronize:
        process.env.DB_SYNCHRONIZE === 'true' ||
        process.env.NODE_ENV !== 'production',
      dropSchema: false, // 기존 스키마 보존
      migrationsRun: false, // 마이그레이션 자동 실행 비활성화
    }),
    CardsetModule,
    CardsetManagerModule,
    CardModule,
    WebSocketModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
