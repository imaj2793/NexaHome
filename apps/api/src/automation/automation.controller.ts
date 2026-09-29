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
import { AutomationService } from './automation.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('homeId') homeId?: string,
  ) {
    return this.automationService.list(user.id, homeId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.automationService.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateAutomationDto) {
    return this.automationService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.automationService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.automationService.remove(user.id, id);
  }

  @Post(':id/run')
  run(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.automationService.runNow(user.id, id);
  }
}
