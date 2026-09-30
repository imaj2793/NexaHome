import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { HomesService } from './homes.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateHomeDto } from './dto/create-home.dto';
import { UpdateHomeDto } from './dto/update-home.dto';

@Controller('homes')
@UseGuards(JwtAuthGuard)
export class HomesController {
  constructor(private readonly homesService: HomesService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserData) {
    return this.homesService.findAll(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.homesService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateHomeDto) {
    return this.homesService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateHomeDto,
  ) {
    return this.homesService.update(user.id, id, dto);
  }

  /** Anggota rumah: melihat daftar hanya butuh keanggotaan, mengelola butuh owner. */
  @Get(':id/members')
  listMembers(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.homesService.listMembers(user.id, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.homesService.addMember(user.id, id, dto.email);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.homesService.removeMember(user.id, id, memberId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.homesService.remove(user.id, id);
  }
}
