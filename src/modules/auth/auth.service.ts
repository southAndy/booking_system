import { randomInt, randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';
import { JwtConfig } from '../../config/configuration';
import { UsersService } from '../users/users.service';
import { AuthMailerService } from './auth-mailer.service';
import { CurrentAuthUser } from './auth.types';
import { AuthTokensDto } from './dto/auth-response.dto';
import { EmailResendDto } from './dto/email-resend.dto';
import { EmailVerifyDto } from './dto/email-verify.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailVerification } from './entities/email-verification.entity';
import { TokenSession } from './entities/token.entity';
import { JwtPayload } from './strategies/jwt.strategy';

const EMAIL_CODE_TTL_MINUTES = 10;
const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: AuthMailerService,
    @InjectRepository(EmailVerification)
    private readonly verifications: Repository<EmailVerification>,
    @InjectRepository(TokenSession)
    private readonly sessions: Repository<TokenSession>,
  ) {}

  async register(dto: RegisterDto) {
    this.ensurePasswordConfirmed(dto.password, dto.password_confirm);
    const user = await this.users.createUser(dto);
    await this.issueVerificationCode(user.id, user.email);

    return {
      data: {
        user_id: user.id,
        email: user.email,
        name: user.name,
        email_verified: false,
      },
      message: 'register successful, please verify your email',
    };
  }

  async verifyEmail(dto: EmailVerifyDto) {
    const email = this.users.normalizeEmail(dto.email);
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'user not found' });
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'email is already verified',
      });
    }

    const verification = await this.verifications.findOne({
      where: { userId: user.id, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (!verification) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_CODE',
        message: 'verification code is invalid',
      });
    }

    if (verification.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: 'VERIFICATION_CODE_EXPIRED',
        message: 'verification code has expired',
      });
    }

    if (verification.attemptCount >= EMAIL_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_CODE',
        message: 'verification code is invalid',
      });
    }

    const matched = await bcrypt.compare(dto.code, verification.codeHash);
    if (!matched) {
      verification.attemptCount += 1;
      await this.verifications.save(verification);
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_CODE',
        message: 'verification code is invalid',
      });
    }

    verification.usedAt = new Date();
    user.emailVerifiedAt = new Date();
    await this.verifications.save(verification);
    await this.users.save(user);

    return {
      data: {
        user_id: user.id,
        email: user.email,
        email_verified: true,
      },
      message: 'email verified successfully',
    };
  }

  async resendVerification(dto: EmailResendDto) {
    const email = this.users.normalizeEmail(dto.email);
    const user = await this.users.findByEmail(email);

    if (!user || user.emailVerifiedAt) {
      return {
        data: { resent: true },
        message: 'if the email is eligible, a verification code has been sent',
      };
    }

    const latest = await this.verifications.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (latest && latest.createdAt.getTime() > Date.now() - EMAIL_CODE_RESEND_COOLDOWN_SECONDS * 1000) {
      throw new HttpException(
        {
          code: 'VERIFICATION_CODE_RESEND_TOO_FREQUENT',
          message: 'please wait before requesting another code',
        },
        429,
      );
    }

    await this.issueVerificationCode(user.id, user.email);

    return {
      data: { resent: true },
      message: 'if the email is eligible, a verification code has been sent',
    };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'email or password is incorrect',
      });
    }

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'email or password is incorrect',
      });
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'please verify your email before login',
      });
    }

    const tokens = await this.signTokens(user.id, user.email, user.role, userAgent);
    delete (user as Partial<typeof user>).password;

    return {
      data: {
        user: {
          user_id: user.id,
          email: user.email,
          name: user.name,
          email_verified: true,
        },
        tokens: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.expiresIn,
        },
      },
      message: 'login successful',
    };
  }

  async refresh(user: CurrentAuthUser, userAgent?: string) {
    // rotation：撤銷此次使用的 refresh session，簽發全新的 token pair。
    // signTokens 會建立新的 sessionId，舊 session 立即失效，降低被竊用風險。
    if (user.sessionId) {
      await this.sessions.update({ sessionId: user.sessionId }, { revoked: true });
    }

    const tokens = await this.signTokens(user.id, user.email, user.role, userAgent);

    return {
      data: {
        tokens: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.expiresIn,
        },
      },
      message: 'token refreshed',
    };
  }

  async logout(user: CurrentAuthUser) {
    if (user.sessionId) {
      await this.sessions.update({ sessionId: user.sessionId }, { revoked: true });
    }

    return {
      data: { logged_out: true },
      message: 'logout successful',
    };
  }

  async validateSession(sessionId: string): Promise<TokenSession | null> {
    return this.sessions.findOne({ where: { sessionId } });
  }

  private async signTokens(
    userId: string,
    email: string,
    role: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const jwtConfig = this.config.get<JwtConfig>('jwt')!;
    const sessionId = randomUUID();
    const payload: JwtPayload = { sub: userId, email, role, sid: sessionId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: jwtConfig.accessSecret,
        expiresIn: jwtConfig.accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshExpiresIn,
      }),
    ]);

    await this.sessions.save(
      this.sessions.create({
        sessionId,
        userId,
        refreshTokenHash: this.sha256(refreshToken),
        deviceInfo: userAgent?.slice(0, 255) ?? null,
        expiresAt: this.addDuration(jwtConfig.refreshExpiresIn),
        revoked: false,
        lastUsedAt: new Date(),
      }),
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.durationToSeconds(jwtConfig.accessExpiresIn),
    };
  }

  private async issueVerificationCode(userId: string, email: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);

    await this.verifications.save(
      this.verifications.create({
        userId,
        codeHash,
        expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60 * 1000),
        usedAt: null,
      }),
    );

    await this.mailer.sendVerificationCode(email, code);
  }

  private ensurePasswordConfirmed(password: string, passwordConfirm: string): void {
    if (password !== passwordConfirm) {
      throw new BadRequestException({
        code: 'PASSWORD_CONFIRM_MISMATCH',
        message: 'password confirmation does not match',
      });
    }
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private addDuration(value: string): Date {
    const seconds = this.durationToSeconds(value);
    return new Date(Date.now() + seconds * 1000);
  }

  private durationToSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      throw new Error(`Unsupported duration format: ${value}`);
    }
    const amount = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 60 * 60;
      case 'd':
        return amount * 60 * 60 * 24;
      default:
        throw new Error(`Unsupported duration unit: ${unit}`);
    }
  }
}
