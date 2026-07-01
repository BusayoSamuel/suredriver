import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles } from '../auth/jwt-auth.guard';
import { NombaService } from './nomba.service';
import { PaymentsService } from './payments.service';

class CheckoutDto {
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private nomba: NombaService,
  ) {}

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

  @Post('bookings/:bookingId/confirm')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.owner)
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('bookingId') bookingId: string,
  ) {
    return this.paymentsService.confirmCheckoutPayment(user.sub, bookingId);
  }

  @Get('return')
  paymentReturn(@Query('bookingId') bookingId: string, @Res() res: Response) {
    const id = bookingId ?? '';
    const deepLink = `suredriver://payment/success?bookingId=${encodeURIComponent(id)}`;
    res.type('html').send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Payment complete</title>
<meta http-equiv="refresh" content="0;url=${deepLink}"/>
</head><body style="font-family:system-ui;text-align:center;padding:2rem">
<p>Payment complete. Returning to SureDriver…</p>
<p><a href="${deepLink}">Tap here if the app does not open</a></p>
<script>window.location.href=${JSON.stringify(deepLink)};</script>
</body></html>`);
  }

  @Post('webhooks/nomba')
  nombaWebhook(
    @Headers('nomba-signature') signature: string,
    @Headers('nomba-timestamp') timestamp: string,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = body as Parameters<PaymentsService['handleWebhook']>[0];
    if (!this.nomba.verifyWebhookSignature(payload, signature, timestamp)) {
      throw new UnauthorizedException('Invalid Nomba webhook signature');
    }
    return this.paymentsService.handleWebhook(payload);
  }
}
