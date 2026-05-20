import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { DatabaseConfig } from './configuration';

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const db = config.get<DatabaseConfig>('database')!;
    return {
      type: 'postgres',
      host: db.host,
      port: db.port,
      username: db.username,
      password: db.password,
      database: db.database,
      ssl: db.ssl ? { rejectUnauthorized: false } : false,
      synchronize: false,
      logging: db.logging,
      autoLoadEntities: true,
      migrationsRun: false,
    };
  },
};
