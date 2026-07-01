import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [AdminController],
})
export class AdminModule {}
