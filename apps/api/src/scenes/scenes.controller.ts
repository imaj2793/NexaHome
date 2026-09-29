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
import { ScenesService } from './scenes.service';
import { CreateSceneDto } from './dto/create-scene.dto';
import { UpdateSceneDto } from './dto/update-scene.dto';

@Controller('scenes')
@UseGuards(JwtAuthGuard)
export class ScenesController {
  constructor(private readonly scenesService: ScenesService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query('homeId') homeId?: string,
  ) {
    return this.scenesService.list(user.id, homeId);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.scenesService.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateSceneDto) {
    return this.scenesService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateSceneDto,
  ) {
    return this.scenesService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.scenesService.remove(user.id, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.scenesService.activate(user.id, id);
  }
}
