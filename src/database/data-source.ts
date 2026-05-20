import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.schema';

dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
});
const env = validateEnv(process.env);

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: env.DB_LOGGING,
  entities: ['src/modules/**/entities/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
