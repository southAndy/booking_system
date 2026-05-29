import { BadRequestException, ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const appCfg = config.get<AppConfig>('app')!;

  app.use(helmet());
  app.use(compression());
  app.enableCors({ origin: appCfg.corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .filter(Boolean),
        }),
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  // API 文件：production 不掛載,避免對外暴露 schema。
  if (appCfg.env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Booking Service API')
      .setDescription(
        '預訂服務 REST API。所有成功回應統一包在 { data, message } 信封;' +
          '錯誤為 { code, message, request_id }。需認證的端點請點右上 Authorize 帶入 access token。',
      )
      .setVersion('1.0')
      .addServer('/api/v1')
      // 預設 bearer scheme:對應各 controller 的 @ApiBearerAuth(),帶 access token。
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token',
      })
      // 僅 POST /auth/refresh 使用:帶 refresh token。
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Refresh token（僅 /auth/refresh 使用）',
        },
        'refresh-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(appCfg.port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Application is running on ${appCfg.url}`);
}

void bootstrap();
