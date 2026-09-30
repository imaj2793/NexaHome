import { IsEmail } from 'class-validator';

export class AddMemberDto {
  @IsEmail({}, { message: 'email harus berupa alamat email yang valid' })
  email!: string;
}
