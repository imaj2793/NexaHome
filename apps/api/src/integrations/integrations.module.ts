import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [DeviceCoreModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
