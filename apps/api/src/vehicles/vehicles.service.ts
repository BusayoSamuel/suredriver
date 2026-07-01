import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  private async getOwnerProfileId(userId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Owner profile not found');
    return profile.id;
  }

  async list(userId: string) {
    const ownerProfileId = await this.getOwnerProfileId(userId);
    return this.prisma.vehicle.findMany({ where: { ownerProfileId } });
  }

  async create(
    userId: string,
    data: { make: string; model: string; plateNumber: string; color?: string },
  ) {
    const ownerProfileId = await this.getOwnerProfileId(userId);
    return this.prisma.vehicle.create({
      data: { ...data, ownerProfileId },
    });
  }

  async remove(userId: string, vehicleId: string) {
    const ownerProfileId = await this.getOwnerProfileId(userId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerProfileId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    await this.prisma.vehicle.delete({ where: { id: vehicleId } });
    return { deleted: true };
  }
}
