import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { appendHistory } from '../bookings/bookings.service';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private payments: PaymentsService,
  ) {}

  async updateStatus(driverId: string, bookingId: string, status: 'driver_en_route') {
    const booking = await this.getDriverBooking(driverId, bookingId);

    if (booking.status === BookingStatus.driver_en_route) {
      return this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { trip: true, owner: true },
      });
    }

    const canMarkEnRoute =
      booking.status === BookingStatus.driver_assigned ||
      (booking.status === BookingStatus.paid && booking.driverId === driverId);

    if (!canMarkEnRoute) {
      throw new BadRequestException('Invalid status transition');
    }

    const history = appendHistory(booking.trip!.statusHistory, status);
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.driver_en_route,
        trip: { update: { statusHistory: history } },
      },
      include: { trip: true, owner: true },
    });

    await this.notifications.sendToUser(booking.ownerId, {
      title: 'Driver en route',
      body: 'Your driver is on the way.',
      data: { bookingId },
    });

    return updated;
  }

  async startTrip(driverId: string, bookingId: string) {
    const booking = await this.getDriverBooking(driverId, bookingId);
    if (
      booking.status !== BookingStatus.driver_assigned &&
      booking.status !== BookingStatus.driver_en_route
    ) {
      throw new BadRequestException('Cannot start trip from current status');
    }

    const history = appendHistory(booking.trip!.statusHistory, 'in_progress');
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.in_progress,
        trip: {
          update: {
            startedAt: new Date(),
            statusHistory: history,
          },
        },
      },
      include: { trip: true },
    });
  }

  async endTrip(driverId: string, bookingId: string) {
    const booking = await this.getDriverBooking(driverId, bookingId);
    if (booking.status !== BookingStatus.in_progress) {
      throw new BadRequestException('Trip not in progress');
    }

    const endedAt = new Date();
    const startedAt = booking.trip!.startedAt ?? endedAt;
    const actualMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

    const history = appendHistory(booking.trip!.statusHistory, 'completed');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.completed,
        trip: {
          update: {
            endedAt,
            statusHistory: history,
          },
        },
      },
      include: { payment: true, owner: true, trip: true },
    });

    await this.notifications.sendToUser(booking.ownerId, {
      title: 'Trip completed',
      body: `Your trip finished (${actualMinutes} min).`,
      data: { bookingId },
    });

    let payout: {
      success: boolean;
      transferId?: string;
      amountKobo: number;
      reason?: string;
    };

    try {
      const result = await this.payments.triggerDriverPayout(bookingId);
      payout = {
        success: result.success,
        transferId: result.transferId,
        amountKobo: booking.driverPayoutKobo,
        reason: result.reason,
      };
    } catch (err) {
      payout = {
        success: false,
        amountKobo: booking.driverPayoutKobo,
        reason: err instanceof Error ? err.message : 'Payout failed',
      };
    }

    return {
      ...updated,
      actualMinutes,
      payout,
    };
  }

  private async getDriverBooking(driverId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.driverId !== driverId) throw new ForbiddenException();
    return booking;
  }
}
