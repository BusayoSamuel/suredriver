import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

class RegisterTokenDto {
  @IsString()
  token!: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('register')
  register(@CurrentUser() user: JwtPayload, @Body() dto: RegisterTokenDto) {
    return this.notificationsService.registerToken(user.sub, dto.token);
  }
}
