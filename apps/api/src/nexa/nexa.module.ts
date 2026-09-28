import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { NexaController } from './nexa.controller';
import { NexaService } from './nexa.service';
import { NexaToolsService } from './nexa-tools.service';

@Module({
  imports: [DeviceCoreModule],
  controllers: [NexaController],
  providers: [NexaService, NexaToolsService],
})
export class NexaModule {}
