import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

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
}
