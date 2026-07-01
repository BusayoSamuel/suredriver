import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

class CheckoutDto {
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('bookings/:bookingId/checkout')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.owner)
  checkout(
    @CurrentUser() user: JwtPayload,
    @Param('bookingId') bookingId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.paymentsService.initializeCheckout(user.sub, bookingId, dto.callbackUrl);
  }

  @Post('bookings/:bookingId/mock-confirm')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.owner)
  mockConfirm(@CurrentUser() user: JwtPayload, @Param('bookingId') bookingId: string) {
    return this.paymentsService.confirmMockPayment(user.sub, bookingId);
  }

  @Post('webhooks/nomba')
  nombaWebhook(
    @Headers('nomba-signature') _signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.paymentsService.handleWebhook(body as Parameters<PaymentsService['handleWebhook']>[0]);
  }
}
