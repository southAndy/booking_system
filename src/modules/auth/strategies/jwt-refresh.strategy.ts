import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { JwtConfig } from '../../../config/configuration';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from './jwt.strategy';
import { CurrentAuthUser } from '../auth.types';
import { TokenSession } from '../entities/token.entity';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    @InjectRepository(TokenSession) private readonly sessions: Repository<TokenSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<JwtConfig>('jwt')!.refreshSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<CurrentAuthUser> {
    const session = await this.sessions.findOne({ where: { sessionId: payload.sid } });
    if (!session || session.revoked || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'refresh token is invalid or expired',
      });
    }

    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'refresh token is invalid or expired',
      });
    }

    return { ...user, sessionId: session.sessionId };
  }
}
