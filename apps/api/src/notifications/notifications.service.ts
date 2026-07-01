import { Injectable, Logger } from '@nestjs/common';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expo = new Expo();

  constructor(private prisma: PrismaService) {}

  async registerToken(userId: string, token: string) {
    if (!Expo.isExpoPushToken(token)) {
      return { registered: false, reason: 'Invalid Expo push token' };
    }
    await this.prisma.pushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token },
      update: {},
    });
    return { registered: true };
  }

  async sendToUser(
    userId: string,
    message: { title: string; body: string; data?: Record<string, string> },
  ) {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    if (!tokens.length) {
      this.logger.debug(`No push tokens for user ${userId}: ${message.title}`);
      return;
    }

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        sound: 'default',
        title: message.title,
        body: message.body,
        data: message.data,
      }));

    if (!messages.length) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        this.logger.error('Push send failed', err);
      }
    }
  }

  async notifyOnlineDrivers(message: { title: string; body: string; data?: Record<string, string> }) {
    const drivers = await this.prisma.driverProfile.findMany({
      where: { isOnline: true },
      select: { userId: true },
    });
    await Promise.all(drivers.map((d) => this.sendToUser(d.userId, message)));
  }
}
