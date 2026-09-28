import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [DeviceCoreModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
