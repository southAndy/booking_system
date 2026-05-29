import { IsEmail, Length } from 'class-validator';

export class EmailResendDto {
  @IsEmail()
  @Length(1, 255)
  email!: string;
}
