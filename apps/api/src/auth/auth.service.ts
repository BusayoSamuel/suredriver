import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt-auth.guard';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('234')) return digits;
    if (digits.startsWith('0')) return `234${digits.slice(1)}`;
    return digits;
  }

  async checkInvite(phone: string) {
    const normalized = this.normalizePhone(phone);
    const invite = await this.prisma.invite.findUnique({ where: { phone: normalized } });
    if (!invite) {
      throw new UnauthorizedException('Phone not on invite list. Contact support.');
    }
    const existing = await this.prisma.user.findUnique({ where: { phone: normalized } });
    return {
      phone: normalized,
      role: invite.role,
      needsPinSetup: !existing?.pinHash,
      hasAccount: !!existing,
    };
  }

  async setupPin(phone: string, pin: string, fullName?: string) {
    if (!/^\d{4}$/.test(pin)) {
      throw new BadRequestException('PIN must be 4 digits');
    }
    const normalized = this.normalizePhone(phone);
    const invite = await this.prisma.invite.findUnique({ where: { phone: normalized } });
    if (!invite) throw new UnauthorizedException('Not invited');

    const pinHash = await bcrypt.hash(pin, 10);
    let user = await this.prisma.user.findUnique({ where: { phone: normalized } });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { pinHash, fullName: fullName ?? user.fullName },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          pinHash,
          role: invite.role,
          fullName,
          invite: { connect: { id: invite.id } },
          ...(invite.role === 'owner'
            ? { ownerProfile: { create: {} } }
            : { driverProfile: { create: {} } }),
        },
      });
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { used: true, userId: user.id },
      });
    }

    return this.signInResponse(user);
  }

  async login(phone: string, pin: string) {
    const normalized = this.normalizePhone(phone);
    const user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    if (!user?.pinHash) {
      throw new UnauthorizedException('Account not set up. Please create your PIN first.');
    }
    const valid = await bcrypt.compare(pin, user.pinHash);
    if (!valid) throw new UnauthorizedException('Invalid PIN');
    return this.signInResponse(user);
  }

  private signInResponse(user: { id: string; phone: string; role: UserRole; fullName: string | null }) {
    const payload: JwtPayload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }
}
