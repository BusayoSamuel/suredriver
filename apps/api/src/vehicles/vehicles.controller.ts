import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles } from '../auth/jwt-auth.guard';
import { VehiclesService } from './vehicles.service';

class CreateVehicleDto {
  @IsString()
  make!: string;

  @IsString()
  model!: string;

  @IsString()
  plateNumber!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.owner)
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.vehiclesService.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(user.sub, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.vehiclesService.remove(user.sub, id);
  }
}
