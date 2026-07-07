import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles } from '../auth/jwt-auth.guard';
import { DriversService } from './drivers.service';

class OnboardingDto {
  @IsString()
  bankCode!: string;

  @IsString()
  bankName!: string;

  @IsString()
  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @Matches(/^\d{10}$/, { message: 'Account number must be exactly 10 digits' })
  accountNumber!: string;

  @IsString()
  accountName!: string;
}

class OnlineDto {
  @IsBoolean()
  isOnline!: boolean;
}

@Controller('drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Get('me')
  @Roles(UserRole.driver)
  me(@CurrentUser() user: JwtPayload) {
    return this.driversService.getProfile(user.sub);
  }

  @Post('onboarding')
  @Roles(UserRole.driver)
  onboarding(@CurrentUser() user: JwtPayload, @Body() dto: OnboardingDto) {
    return this.driversService.saveBankDetails(user.sub, dto);
  }

  @Patch('online')
  @Roles(UserRole.driver)
  setOnline(@CurrentUser() user: JwtPayload, @Body() dto: OnlineDto) {
    return this.driversService.setOnline(user.sub, dto.isOnline);
  }

  @Get('jobs/offers')
  @Roles(UserRole.driver)
  jobOffers(@CurrentUser() user: JwtPayload) {
    return this.driversService.getJobOffers(user.sub);
  }

  @Get('jobs/active')
  @Roles(UserRole.driver)
  activeJob(@CurrentUser() user: JwtPayload) {
    return this.driversService.getActiveJob(user.sub);
  }

  @Get('earnings')
  @Roles(UserRole.driver)
  earnings(@CurrentUser() user: JwtPayload) {
    return this.driversService.getEarnings(user.sub);
  }
}
