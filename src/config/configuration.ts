import { Env } from './env.schema';

export interface AppConfig {
  env: Env['NODE_ENV'];
  port: number;
  url: string;
  corsOrigins: string[];
  logLevel: Env['LOG_LEVEL'];
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  logging: boolean;
  ssl: boolean;
}

export interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface SecurityConfig {
  bcryptSaltRounds: number;
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  security: SecurityConfig;
}

export function buildConfig(env: Env): RootConfig {
  return {
    app: {
      env: env.NODE_ENV,
      port: env.PORT,
      url: env.APP_URL,
      corsOrigins: env.CORS_ORIGINS,
      logLevel: env.LOG_LEVEL,
    },
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
      logging: env.DB_LOGGING,
      ssl: env.DB_SSL,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
    security: {
      bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
    },
  };
}
