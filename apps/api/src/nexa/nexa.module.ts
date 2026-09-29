import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { ScenesModule } from '../scenes/scenes.module';
import { AutomationModule } from '../automation/automation.module';
import { EnergyModule } from '../energy/energy.module';
import { NexaController } from './nexa.controller';
import { NexaService } from './nexa.service';
import { NexaToolsService } from './nexa-tools.service';
import { SttService } from './stt.service';

@Module({
  imports: [DeviceCoreModule, ScenesModule, AutomationModule, EnergyModule],
  controllers: [NexaController],
  providers: [NexaService, NexaToolsService, SttService],
})
export class NexaModule {}
