import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { DeviceCoreService } from '../device-core/device-core.service';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly deviceCore: DeviceCoreService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('homeId') homeId?: string,
  ) {
    return this.integrationsService.findAll(user.id, homeId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateIntegrationDto,
  ) {
    return this.integrationsService.create(user.id, dto);
  }

  /** Simpan ulang kredensial (terenkripsi) atau ubah status integrasi. */
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.integrationsService.update(user.id, id, dto);
  }

  @Post(':id/discover')
  discover(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.deviceCore.discover(user.id, id);
  }
}
