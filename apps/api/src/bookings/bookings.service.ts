import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, DurationType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { quoteBooking, getDurationConfig } from './pricing';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  getQuote(durationType: DurationType) {
    return quoteBooking(durationType);
  }

  async create(
    ownerId: string,
    data: {
      vehicleId: string;
      durationType: DurationType;
      pickupAddress: string;
      notes?: string;
      scheduledAt?: string;
    },
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      include: { ownerProfile: true },
    });
    if (!owner?.ownerProfile) throw new NotFoundException('Owner profile not found');

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: data.vehicleId, ownerProfileId: owner.ownerProfile.id },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const config = getDurationConfig(data.durationType);
    const { priceKobo, platformFeeKobo, driverPayoutKobo } = quoteBooking(data.durationType);

    const booking = await this.prisma.booking.create({
      data: {
        ownerId,
        vehicleId: data.vehicleId,
        durationType: data.durationType,
        durationHours: config.hours,
        pickupAddress: data.pickupAddress,
        notes: data.notes,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        status: BookingStatus.awaiting_payment,
        priceKobo,
        platformFeeKobo,
        driverPayoutKobo,
        payment: {
          create: {
            amountKobo: priceKobo,
            status: 'pending',
          },
        },
        trip: {
          create: {
            statusHistory: [{ status: 'awaiting_payment', at: new Date().toISOString() }],
          },
        },
      },
      include: { payment: true, vehicle: true, trip: true },
    });

    return booking;
  }

  async listForOwner(ownerId: string) {
    return this.prisma.booking.findMany({
      where: { ownerId },
      include: {
        driver: { select: { fullName: true, phone: true } },
        vehicle: true,
        payment: true,
        trip: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(userId: string, role: UserRole, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        owner: { select: { id: true, fullName: true, phone: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        vehicle: true,
        payment: true,
        trip: true,
        review: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (role === UserRole.owner && booking.ownerId !== userId) {
      throw new ForbiddenException();
    }
    if (role === UserRole.driver && booking.driverId && booking.driverId !== userId) {
      throw new ForbiddenException();
    }
    return booking;
  }

  async acceptJob(driverId: string, bookingId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!profile?.isOnline) throw new BadRequestException('Go online to accept jobs');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { trip: true, owner: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingStatus.paid) {
      throw new BadRequestException('Booking not available');
    }
    if (booking.driverId) throw new BadRequestException('Already assigned');

    const history = appendHistory(booking.trip!.statusHistory, 'driver_assigned');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        driverId,
        status: BookingStatus.driver_assigned,
        trip: { update: { statusHistory: history } },
      },
      include: { owner: true, driver: true, vehicle: true, trip: true, payment: true },
    });

    await this.notifications.sendToUser(booking.ownerId, {
      title: 'Driver assigned',
      body: 'A driver has accepted your booking.',
      data: { bookingId },
    });

    return updated;
  }

  async addReview(
    reviewerId: string,
    bookingId: string,
    rating: number,
    comment?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status !== BookingStatus.completed) {
      throw new BadRequestException('Can only review completed trips');
    }
    if (booking.ownerId !== reviewerId) {
      throw new ForbiddenException('Only owner can review');
    }
    if (!booking.driverId) throw new BadRequestException('No driver to review');

    const existing = await this.prisma.review.findUnique({ where: { bookingId } });
    if (existing) throw new BadRequestException('Already reviewed');

    await this.prisma.$transaction([
      this.prisma.review.create({
        data: {
          bookingId,
          reviewerId,
          revieweeId: booking.driverId,
          rating,
          comment,
        },
      }),
      this.prisma.driverProfile.update({
        where: { userId: booking.driverId },
        data: {
          ratingCount: { increment: 1 },
          ratingAvg: await this.computeNewRating(booking.driverId, rating),
        },
      }),
    ]);

    return { success: true };
  }

  private async computeNewRating(driverId: string, newRating: number) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!profile) return newRating;
    const total = profile.ratingAvg * profile.ratingCount + newRating;
    return total / (profile.ratingCount + 1);
  }
}

function appendHistory(existing: unknown, status: string) {
  const arr = Array.isArray(existing) ? [...existing] : [];
  arr.push({ status, at: new Date().toISOString() });
  return arr;
}

export { appendHistory };
