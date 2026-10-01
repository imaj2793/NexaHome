import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CredentialReader } from './credential-reader.service';

@Module({
  imports: [ConfigModule],
  providers: [CredentialReader],
  exports: [CredentialReader],
})
export class CredentialReaderModule {}
