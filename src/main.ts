import { BadRequestException, ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
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

  await app.listen(appCfg.port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Application is running on ${appCfg.url}`);
}

void bootstrap();
