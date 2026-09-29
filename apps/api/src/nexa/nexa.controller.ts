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
import { SttService } from './stt.service';
import { NexaChatDto } from './dto/nexa-chat.dto';
import { NexaSpeechDto } from './dto/nexa-speech.dto';
import { NexaTranscribeDto } from './dto/nexa-transcribe.dto';

@Controller('nexa')
@UseGuards(JwtAuthGuard)
export class NexaController {
  constructor(
    private readonly nexa: NexaService,
    private readonly stt: SttService,
  ) {}

  @Post('chat')
  chat(@CurrentUser() user: CurrentUserData, @Body() dto: NexaChatDto) {
    return this.nexa.chat(user.id, dto.message);
  }

  @Post('transcribe')
  async transcribe(@Body() dto: NexaTranscribeDto): Promise<{ text: string }> {
    const audio = Buffer.from(dto.audio, 'base64');
    const text = await this.stt.transcribe(audio);
    return { text };
  }

  @Post('speech')
  @Header('Content-Type', 'audio/mpeg')
  async speech(@Body() dto: NexaSpeechDto): Promise<StreamableFile> {
    const audio = await this.nexa.synthesize(dto.text);
    return new StreamableFile(audio);
  }
}
