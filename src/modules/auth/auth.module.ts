import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthMailerService } from './auth-mailer.service';
import { AuthService } from './auth.service';
import { EmailVerification } from './entities/email-verification.entity';
import { TokenSession } from './entities/token.entity';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([EmailVerification, TokenSession]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthMailerService, JwtStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
