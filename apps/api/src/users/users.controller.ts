import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  defaultAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user.sub, dto);
  }
}
