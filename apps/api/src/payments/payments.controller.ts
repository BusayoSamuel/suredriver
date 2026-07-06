import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
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

function paymentCompleteHtml(deepLink: string) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Payment complete</title>
<script>
  setTimeout(function () {
    window.location.replace(${JSON.stringify(deepLink)});
  }, 400);
</script>
</head><body style="font-family:system-ui;text-align:center;padding:2rem">
<p style="font-size:1.25rem;font-weight:600">Payment complete</p>
<p>Returning to SureDriver…</p>
</body></html>`;
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private paymentsService: PaymentsService,
    private nomba: NombaService,
  ) {}

  private processNombaWebhook(
    body: Record<string, unknown>,
    signature: string | undefined,
    sigValue: string | undefined,
    timestamp: string | undefined,
    source: string,
  ) {
    const payload = body as Parameters<PaymentsService['handleWebhook']>[0];
    this.logger.log(
      `Nomba webhook on ${source}: event=${payload.event_type ?? '?'} order=${payload.data?.order?.orderReference ?? '?'}`,
    );

    const sig = signature ?? sigValue;
    if (!this.nomba.verifyWebhookSignature(payload, sig, timestamp)) {
      throw new UnauthorizedException('Invalid Nomba webhook signature');
    }
    return this.paymentsService.handleWebhook(payload);
  }

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
  async paymentReturn(
    @Query('bookingId') bookingId: string | undefined,
    @Res() res: Response,
  ) {
    if (bookingId) {
      await this.paymentsService.syncPaymentFromNomba(bookingId).catch(() => undefined);
    }

    const deepLink = bookingId
      ? `suredriver://payments/return?bookingId=${encodeURIComponent(bookingId)}`
      : 'suredriver://';

    res.type('html').send(paymentCompleteHtml(deepLink));
  }

  /** Legacy: sandbox may POST to order callbackUrl if it was /payments/return. */
  @Post('return')
  paymentReturnWebhook(
    @Headers('nomba-signature') signature: string | undefined,
    @Headers('nomba-sig-value') sigValue: string | undefined,
    @Headers('nomba-timestamp') timestamp: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.processNombaWebhook(body, signature, sigValue, timestamp, '/payments/return');
  }

  /** Browser redirect after checkout — Nomba appends ?orderReference=… */
  @Get('webhooks/nomba')
  async nombaWebhookRedirect(
    @Query('orderReference') orderReference: string | undefined,
    @Query('bookingId') bookingId: string | undefined,
    @Res() res: Response,
  ) {
    this.logger.log(`Nomba GET /payments/webhooks/nomba orderReference=${orderReference ?? '?'}`);

    let resolvedBookingId = bookingId ?? null;
    if (orderReference) {
      const synced = await this.paymentsService.syncPaymentFromNombaByOrderReference(orderReference);
      resolvedBookingId = resolvedBookingId ?? synced;
    } else if (bookingId) {
      await this.paymentsService.syncPaymentFromNomba(bookingId).catch(() => undefined);
    }

    const deepLink = resolvedBookingId
      ? `suredriver://payments/return?bookingId=${encodeURIComponent(resolvedBookingId)}`
      : 'suredriver://';

    res.type('html').send(paymentCompleteHtml(deepLink));
  }

  @Post('webhooks/nomba')
  nombaWebhook(
    @Headers('nomba-signature') signature: string | undefined,
    @Headers('nomba-sig-value') sigValue: string | undefined,
    @Headers('nomba-timestamp') timestamp: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.processNombaWebhook(body, signature, sigValue, timestamp, '/payments/webhooks/nomba');
  }
}
