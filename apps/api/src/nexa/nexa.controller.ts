import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Post,
  ServiceUnavailableException,
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
  private readonly logger = new Logger(NexaController.name);

  constructor(
    private readonly nexa: NexaService,
    private readonly stt: SttService,
  ) {}

  /**
   * Kemampuan Nexa saat ini. Client memanggil endpoint ini supaya mode mock
   * atau STT yang belum dikonfigurasi tampil sebagai "mode terbatas", bukan
   * sebagai kegagalan (blueprint §27).
   */
  @Get('status')
  status() {
    return this.nexa.capabilities(this.stt.isConfigured());
  }

  @Post('chat')
  chat(@CurrentUser() user: CurrentUserData, @Body() dto: NexaChatDto) {
    return this.nexa.chat(user.id, dto.message);
  }

  @Post('transcribe')
  async transcribe(@Body() dto: NexaTranscribeDto): Promise<{ text: string }> {
    if (!this.stt.isConfigured()) {
      throw new ServiceUnavailableException(
        'STT belum dikonfigurasi (WHISPER_MODEL kosong). Ketik pesan saja — perintah tetap bekerja.',
      );
    }

    const audio = Buffer.from(dto.audio, 'base64');
    try {
      const text = await this.stt.transcribe(audio);
      return { text };
    } catch (err) {
      // 503 + pesan ramah: client boleh mencoba suara lagi atau beralih ke
      // input teks. Jangan sampai 500 generik yang tidak bisa ditindaklanjuti.
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Transkripsi gagal: ${detail}`);
      throw new ServiceUnavailableException(
        'Gagal mentranskripsi audio. Coba lagi, atau ketik perintahmu.',
      );
    }
  }

  @Post('speech')
  @Header('Content-Type', 'audio/mpeg')
  async speech(@Body() dto: NexaSpeechDto): Promise<StreamableFile> {
    try {
      const audio = await this.nexa.synthesize(dto.text);
      return new StreamableFile(audio);
    } catch (err) {
      // Client (lib/nexa.ts) otomatis jatuh ke speechSynthesis browser.
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`TTS gagal: ${detail}`);
      throw new ServiceUnavailableException(
        'TTS tidak tersedia. Suara akan dibacakan browser.',
      );
    }
  }
}
