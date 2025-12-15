import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 글로벌 API prefix 설정
  app.setGlobalPrefix('api/v1');

  // 정적 파일 서빙 설정 제거 (YJS 제거로 불필요)

  // Socket.IO 어댑터 설정
  app.useWebSocketAdapter(new IoAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('Flip Note API')
    .setDescription('API documentation')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  // swagger 운영 환경에서 비활성화
  // if (process.env.SWAGGER_ENABLED === 'true' || process.env.NODE_ENV !== 'production') {
  //   const config = new DocumentBuilder()
  //     .setTitle('Flip Note API')
  //     .setDescription('API documentation')
  //     .setVersion('1.0.0')
  //     .addBearerAuth()
  //     .build();
  //   const document = SwaggerModule.createDocument(app, config);
  //   SwaggerModule.setup('api-docs', app, document);
  // }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
