import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DeviceCommandDto } from './dto/device-command.dto';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('homeId') homeId?: string,
    @Query('roomId') roomId?: string,
  ) {
    return this.devicesService.findAll(user.id, homeId, roomId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.devicesService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateDeviceDto) {
    return this.devicesService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devicesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.devicesService.remove(user.id, id);
  }

  @Post(':id/commands')
  command(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: DeviceCommandDto,
  ) {
    return this.devicesService.command(user.id, id, dto);
  }
}
