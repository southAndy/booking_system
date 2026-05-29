import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthMailerService {
  private readonly logger = new Logger(AuthMailerService.name);

  async sendVerificationCode(email: string, code: string): Promise<void> {
    this.logger.log(`Verification code for ${email}: ${code}`);
  }
}
