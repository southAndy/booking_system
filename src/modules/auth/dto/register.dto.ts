import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt 上限
  password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password_confirm!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;
}
