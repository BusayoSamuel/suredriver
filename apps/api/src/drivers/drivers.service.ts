import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, phone: true, fullName: true, role: true } } },
    });
    if (!profile) throw new NotFoundException('Driver profile not found');
    return profile;
  }

  async saveBankDetails(
    userId: string,
    data: { bankCode: string; bankName: string; accountNumber: string; accountName: string },
  ) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Driver profile not found');

    return this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: {
        bankCode: data.bankCode,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        verificationStatus: VerificationStatus.pending,
      },
    });
  }

  async setOnline(userId: string, isOnline: boolean) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Driver profile not found');
    if (profile.verificationStatus !== VerificationStatus.approved) {
      throw new ForbiddenException('Driver not approved yet. Send docs via WhatsApp.');
    }
    if (isOnline && (!profile.accountNumber || !profile.bankCode)) {
      throw new BadRequestException('Complete bank onboarding first');
    }

    return this.prisma.driverProfile.update({
      where: { id: profile.id },
      data: { isOnline },
    });
  }

  async getJobOffers(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile?.isOnline) return [];

    return this.prisma.booking.findMany({
      where: {
        status: BookingStatus.paid,
        driverId: null,
      },
      include: {
        owner: { select: { fullName: true, phone: true } },
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async getActiveJob(userId: string) {
    return this.prisma.booking.findFirst({
      where: {
        driverId: userId,
        status: {
          in: [
            BookingStatus.driver_assigned,
            BookingStatus.driver_en_route,
            BookingStatus.in_progress,
          ],
        },
      },
      include: {
        owner: { select: { fullName: true, phone: true } },
        vehicle: true,
        trip: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getEarnings(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Driver profile not found');

    const completed = await this.prisma.booking.findMany({
      where: { driverId: userId, status: BookingStatus.completed },
      include: { payment: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return {
      totalEarningsKobo: profile.totalEarningsKobo,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      trips: completed.map((b) => ({
        id: b.id,
        driverPayoutKobo: b.driverPayoutKobo,
        completedAt: b.updatedAt,
        payoutStatus: b.payment?.payoutStatus,
        nombaTransferId: b.payment?.nombaTransferId,
      })),
    };
  }
}
