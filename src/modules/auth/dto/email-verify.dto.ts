import { IsEmail, Length, Matches } from 'class-validator';

export class EmailVerifyDto {
  @IsEmail()
  @Length(1, 255)
  email!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}
