import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
// import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { buildConfig } from './config/configuration';
import { validateEnv } from './config/env.schema';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { UsersModule } from './modules/users/users.module';

const envFilePath =
  process.env.NODE_ENV === 'production' ? ['.env.production', '.env'] : ['.env'];

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath,
      isGlobal: true,
      cache: true,
      validate: (raw) => {
        const env = validateEnv(raw);
        return { ...env, ...buildConfig(env) };
      },
    }),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.LOG_LEVEL ?? 'info',
          transport:
            process.env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          autoLogging: true,
          genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
          customProps: (req) => ({ requestId: (req as { id?: string }).id }),
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    AuthModule,
    UsersModule,
    ResourcesModule,
  ],
  providers: [
    // { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
