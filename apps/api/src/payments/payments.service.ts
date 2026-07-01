import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, PaymentStatus, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NombaService } from './nomba.service';
import { NotificationsService } from '../notifications/notifications.service';
import { appendHistory } from '../bookings/bookings.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private nomba: NombaService,
    private notifications: NotificationsService,
  ) {}

  async initializeCheckout(ownerId: string, bookingId: string, callbackUrl?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true, owner: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.ownerId !== ownerId) throw new ForbiddenException();
    if (booking.status !== BookingStatus.awaiting_payment) {
      throw new BadRequestException('Booking not awaiting payment');
    }

    const orderReference =
      booking.payment?.nombaOrderReference ?? this.nomba.generateOrderReference();

    const checkout = await this.nomba.createCheckoutOrder({
      amountKobo: booking.priceKobo,
      orderReference,
      customerEmail: `${booking.owner.phone}@suredriver.ng`,
      callbackUrl,
    });

    await this.prisma.payment.update({
      where: { bookingId },
      data: {
        nombaOrderReference: orderReference,
        checkoutLink: checkout.checkoutLink,
        status: PaymentStatus.pending,
      },
    });

    return {
      checkoutLink: checkout.checkoutLink,
      orderReference,
      mock: this.nomba.mockMode,
    };
  }

  /** Mock/simulate payment success for dev and hackathon demos */
  async confirmMockPayment(ownerId: string, bookingId: string) {
    if (!this.nomba.mockMode) {
      throw new BadRequestException('Mock payments only in NOMBA_MOCK mode');
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true, trip: true },
    });
    if (!booking || booking.ownerId !== ownerId) throw new NotFoundException();
    const payment = await this.markPaymentSuccess(
      bookingId,
      booking.payment!.nombaOrderReference ?? bookingId,
    );
    return {
      bookingId,
      status: 'paid',
      nombaOrderReference: payment?.nombaOrderReference,
      nombaTransactionId: payment?.nombaTransactionId,
    };
  }

  async syncPaymentFromNomba(bookingId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { bookingId },
      include: { booking: { include: { trip: true } } },
    });
    if (
      !payment ||
      payment.status !== PaymentStatus.pending ||
      !payment.nombaOrderReference
    ) {
      return;
    }

    const verification = await this.nomba.verifyTransaction(payment.nombaOrderReference);
    if (verification.verified) {
      await this.markPaymentSuccess(
        bookingId,
        verification.transactionId,
        false,
      );
    }
  }

  async confirmCheckoutPayment(ownerId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });
    if (!booking || booking.ownerId !== ownerId) {
      throw new NotFoundException('Booking not found');
    }

    await this.syncPaymentFromNomba(bookingId);

    const updated = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payment: true },
    });

    return {
      bookingId,
      status: updated!.status,
      paymentStatus: updated!.payment?.status ?? 'pending',
      nombaOrderReference: updated!.payment?.nombaOrderReference,
      nombaTransactionId: updated!.payment?.nombaTransactionId,
    };
  }

  async handleWebhook(payload: {
    event_type?: string;
    data?: {
      order?: { orderReference?: string };
      transaction?: { transactionId?: string };
    };
  }) {
    if (payload.event_type !== 'payment_success') {
      return { received: true };
    }

    const orderReference = payload.data?.order?.orderReference;
    const transactionId = payload.data?.transaction?.transactionId;
    if (!orderReference) return { received: true };

    await this.markPaymentSuccess(orderReference, transactionId, true);
    return { received: true };
  }

  private async markPaymentSuccess(
    bookingOrOrderRef: string,
    transactionId?: string | null,
    byOrderRef = false,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: byOrderRef
        ? { nombaOrderReference: bookingOrOrderRef }
        : { bookingId: bookingOrOrderRef },
      include: { booking: { include: { trip: true } } },
    });
    if (!payment || payment.status === PaymentStatus.paid) return payment;

    if (!this.nomba.mockMode && payment.nombaOrderReference) {
      const verification = await this.nomba.verifyTransaction(payment.nombaOrderReference);
      if (!verification.verified) {
        this.logger.warn(`Payment verification failed for ${payment.nombaOrderReference}`);
        return payment;
      }
      transactionId = verification.transactionId ?? transactionId;
    }

    const history = appendHistory(payment.booking.trip!.statusHistory, 'paid');

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.paid,
          nombaTransactionId: transactionId ?? `TXN-${Date.now()}`,
        },
      }),
      this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: BookingStatus.paid },
      }),
      this.prisma.trip.update({
        where: { bookingId: payment.bookingId },
        data: { statusHistory: history },
      }),
    ]);

    await this.notifications.notifyOnlineDrivers({
      title: 'New job available',
      body: 'A paid booking is waiting for a driver.',
      data: { bookingId: payment.bookingId },
    });

    return payment;
  }

  async triggerDriverPayout(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        payment: true,
        driver: { include: { driverProfile: true } },
      },
    });
    if (!booking?.driver?.driverProfile || !booking.payment) {
      throw new NotFoundException('Booking not ready for payout');
    }

    const profile = booking.driver.driverProfile;
    if (!profile.accountNumber || !profile.bankCode) {
      await this.prisma.payment.update({
        where: { id: booking.payment.id },
        data: { payoutStatus: PayoutStatus.failed },
      });
      throw new BadRequestException('Driver bank details missing');
    }

    await this.prisma.payment.update({
      where: { id: booking.payment.id },
      data: { payoutStatus: PayoutStatus.processing, payoutAmountKobo: booking.driverPayoutKobo },
    });

    const merchantTxRef = `PAYOUT-${bookingId}-${Date.now()}`;
    const result = await this.nomba.transferToBank({
      amountKobo: booking.driverPayoutKobo,
      accountNumber: profile.accountNumber,
      accountName: profile.accountName ?? profile.userId,
      bankCode: profile.bankCode,
      merchantTxRef,
    });

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: booking.payment.id },
        data: {
          payoutStatus: result.success ? PayoutStatus.paid : PayoutStatus.failed,
          nombaTransferId: result.transferId,
        },
      }),
      ...(result.success
        ? [
            this.prisma.driverProfile.update({
              where: { id: profile.id },
              data: { totalEarningsKobo: { increment: booking.driverPayoutKobo } },
            }),
          ]
        : []),
    ]);

    if (booking.driverId) {
      await this.notifications.sendToUser(booking.driverId, {
        title: result.success ? 'Payout sent' : 'Payout failed',
        body: result.success
          ? `₦${(booking.driverPayoutKobo / 100).toLocaleString()} sent to your bank.`
          : 'Contact support to retry payout.',
        data: { bookingId },
      });
    }

    return result;
  }

  async retryPayout(bookingId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { bookingId } });
    if (!payment || payment.payoutStatus !== PayoutStatus.failed) {
      throw new BadRequestException('No failed payout to retry');
    }
    return this.triggerDriverPayout(bookingId);
  }
}
