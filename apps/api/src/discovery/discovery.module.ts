import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

@Module({
  imports: [DeviceCoreModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
