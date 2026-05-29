import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { AuthService } from './auth.service';
import { CurrentAuthUser } from './auth.types';
import { EmailResendDto } from './dto/email-resend.dto';
import { EmailVerifyDto } from './dto/email-verify.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: EmailVerifyDto) {
    return this.auth.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: EmailResendDto) {
    return this.auth.resendVerification(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    return this.auth.login(dto, userAgent);
  }

  @Public() //這邊設定跳過全域 token 驗證的原因是：這個路由的呼叫情境就是 token 過期的情境
  @UseGuards(JwtRefreshGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: CurrentAuthUser, @Headers('user-agent') userAgent?: string) {
    return this.auth.refresh(user, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: CurrentAuthUser) {
    return this.auth.logout(user);
  }
}
