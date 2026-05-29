import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { JwtConfig } from '../../../config/configuration';
import { CurrentAuthUser } from '../auth.types';
import { TokenSession } from '../entities/token.entity';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    @InjectRepository(TokenSession) private readonly sessions: Repository<TokenSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<JwtConfig>('jwt')!.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<CurrentAuthUser> {
    const session = await this.sessions.findOne({ where: { sessionId: payload.sid } });
    if (!session || session.revoked || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid or expired access token',
      });
    }

    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'invalid or expired access token',
      });
    }

    session.lastUsedAt = new Date();
    await this.sessions.save(session);

    return { ...user, sessionId: session.sessionId };
  }
}
