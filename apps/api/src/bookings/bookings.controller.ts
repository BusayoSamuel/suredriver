import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DurationType, UserRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles } from '../auth/jwt-auth.guard';
import { BookingsService } from './bookings.service';
import { PaymentsService } from '../payments/payments.service';

class CreateBookingDto {
  @IsString()
  vehicleId!: string;

  @IsEnum(DurationType)
  durationType!: DurationType;

  @IsString()
  pickupAddress!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private bookingsService: BookingsService,
    private paymentsService: PaymentsService,
  ) {}

  @Get('quote')
  quote(@Query('durationType') durationType: DurationType) {
    return this.bookingsService.getQuote(durationType);
  }

  @Post()
  @Roles(UserRole.owner)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    if (user.role === UserRole.owner) {
      return this.bookingsService.listForOwner(user.sub);
    }
    return [];
  }

  @Get(':id')
  async getOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    if (user.role === UserRole.owner) {
      await this.paymentsService.syncPaymentFromNomba(id).catch(() => undefined);
    }
    return this.bookingsService.getById(user.sub, user.role, id);
  }

  @Post(':id/accept')
  @Roles(UserRole.driver)
  accept(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bookingsService.acceptJob(user.sub, id);
  }

  @Post(':id/review')
  @Roles(UserRole.owner)
  review(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.bookingsService.addReview(user.sub, id, dto.rating, dto.comment);
  }
}
