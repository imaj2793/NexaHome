import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { DiscoveryService } from './discovery.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';

@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  /** Scan jaringan universal: mDNS + semua integration terdaftar. */
  @Post('scan')
  scan() {
    return this.discovery.scanNetwork();
  }

  /** Hubungkan perangkat yang ditemukan (buat integrasi bila perlu). */
  @Post('connect')
  connect(@CurrentUser() user: CurrentUserData, @Body() dto: ConnectDeviceDto) {
    return this.discovery.connect(user.id, dto);
  }
}
