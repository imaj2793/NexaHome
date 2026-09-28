import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { ActivityLogService } from './activity-log.service';

@Controller('activity-log')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('homeId') homeId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityLogService.findAll(
      user.id,
      homeId,
      limit ? Number(limit) : undefined,
    );
  }
}
