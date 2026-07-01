import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles } from '../auth/jwt-auth.guard';
import { TripsService } from './trips.service';

class StatusDto {
  @IsIn(['driver_en_route'])
  status!: 'driver_en_route';
}

@Controller('trips')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.driver)
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Post(':bookingId/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('bookingId') bookingId: string,
    @Body() dto: StatusDto,
  ) {
    return this.tripsService.updateStatus(user.sub, bookingId, dto.status);
  }

  @Post(':bookingId/start')
  start(@CurrentUser() user: JwtPayload, @Param('bookingId') bookingId: string) {
    return this.tripsService.startTrip(user.sub, bookingId);
  }

  @Post(':bookingId/end')
  end(@CurrentUser() user: JwtPayload, @Param('bookingId') bookingId: string) {
    return this.tripsService.endTrip(user.sub, bookingId);
  }
}
