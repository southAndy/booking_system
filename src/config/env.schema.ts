import { z } from 'zod';

const truthy = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['true', '1', 'yes'].includes(v.toLowerCase())));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USERNAME: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_DATABASE: z.string().min(1),
    DB_LOGGING: truthy.default(false),
    DB_SSL: truthy.default(false),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ',
    path: ['JWT_REFRESH_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return parsed.data;
}
