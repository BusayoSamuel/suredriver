import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole, VerificationStatus } from '@prisma/client';
import { JwtAuthGuard, Roles } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthService } from '../auth/auth.service';

class CreateInviteDto {
  @IsString()
  phone!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

class ApproveDriverDto {
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.admin)
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private auth: AuthService,
  ) {}

  @Post('invites')
  createInvite(@Body() dto: CreateInviteDto) {
    const phone = this.auth.normalizePhone(dto.phone);
    return this.prisma.invite.upsert({
      where: { phone },
      create: { phone, role: dto.role },
      update: { role: dto.role },
    });
  }

  @Get('drivers/pending')
  pendingDrivers() {
    return this.prisma.driverProfile.findMany({
      where: { verificationStatus: VerificationStatus.pending },
      include: { user: { select: { id: true, phone: true, fullName: true } } },
    });
  }

  @Patch('drivers/:userId/verification')
  approveDriver(@Param('userId') userId: string, @Body() dto: ApproveDriverDto) {
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { verificationStatus: dto.status },
    });
  }

  @Get('bookings')
  allBookings() {
    return this.prisma.booking.findMany({
      include: {
        owner: { select: { phone: true, fullName: true } },
        driver: { select: { phone: true, fullName: true } },
        payment: true,
        vehicle: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('payouts/:bookingId/retry')
  retryPayout(@Param('bookingId') bookingId: string) {
    return this.payments.retryPayout(bookingId);
  }
}
