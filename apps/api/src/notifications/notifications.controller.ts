import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.notifications.list(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: CurrentUserData) {
    return this.notifications.markAllRead(user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.notifications.remove(user.id, id);
  }
}
