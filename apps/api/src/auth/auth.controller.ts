import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { AuthService } from './auth.service';

class CheckInviteDto {
  @IsString()
  phone!: string;
}

class SetupPinDto {
  @IsString()
  phone!: string;

  @Matches(/^\d{4}$/)
  pin!: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

class LoginDto {
  @IsString()
  phone!: string;

  @Length(4, 4)
  pin!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('check-invite')
  checkInvite(@Body() dto: CheckInviteDto) {
    return this.authService.checkInvite(dto.phone);
  }

  @Post('setup-pin')
  setupPin(@Body() dto: SetupPinDto) {
    return this.authService.setupPin(dto.phone, dto.pin, dto.fullName);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.phone, dto.pin);
  }
}
