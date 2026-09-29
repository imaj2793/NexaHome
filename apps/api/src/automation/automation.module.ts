import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [DeviceCoreModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
