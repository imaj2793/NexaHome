import {
  Body,
  Controller,
  Header,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { NexaService } from './nexa.service';
import { NexaChatDto } from './dto/nexa-chat.dto';
import { NexaSpeechDto } from './dto/nexa-speech.dto';

@Controller('nexa')
@UseGuards(JwtAuthGuard)
export class NexaController {
  constructor(private readonly nexa: NexaService) {}

  @Post('chat')
  chat(@CurrentUser() user: CurrentUserData, @Body() dto: NexaChatDto) {
    return this.nexa.chat(user.id, dto.message);
  }

  @Post('speech')
  @Header('Content-Type', 'audio/mpeg')
  async speech(@Body() dto: NexaSpeechDto): Promise<StreamableFile> {
    const audio = await this.nexa.synthesize(dto.text);
    return new StreamableFile(audio);
  }
}
