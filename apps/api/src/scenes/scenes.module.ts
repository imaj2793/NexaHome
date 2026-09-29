import { Module } from '@nestjs/common';
import { DeviceCoreModule } from '../device-core/device-core.module';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';

@Module({
  imports: [DeviceCoreModule],
  controllers: [ScenesController],
  providers: [ScenesService],
  exports: [ScenesService],
})
export class ScenesModule {}
