import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { EnergyService } from './energy.service';

@Controller('energy')
@UseGuards(JwtAuthGuard)
export class EnergyController {
  constructor(private readonly energy: EnergyService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserData) {
    return this.energy.summary(user.id);
  }
}
