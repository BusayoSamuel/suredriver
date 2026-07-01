import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownerProfile: { include: { vehicles: true } },
        driverProfile: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { pinHash: _, ...safe } = user;
    return safe;
  }

  async updateMe(
    userId: string,
    data: { fullName?: string; defaultAddress?: string; emergencyContact?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { ownerProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (data.fullName) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { fullName: data.fullName },
      });
    }

    if (user.ownerProfile && (data.defaultAddress || data.emergencyContact)) {
      await this.prisma.ownerProfile.update({
        where: { id: user.ownerProfile.id },
        data: {
          defaultAddress: data.defaultAddress ?? user.ownerProfile.defaultAddress,
          emergencyContact: data.emergencyContact ?? user.ownerProfile.emergencyContact,
        },
      });
    }

    return this.getMe(userId);
  }
}
