import { Controller, Get, Global, Inject, Module } from '@nestjs/common';
import { MAX_ATTACHMENT_BYTES, type PublicConfig } from '@ezydc/shared';
import { Public } from '../auth/decorators';
import { StorageService } from './storage.service';
import { UploadsService } from './uploads.service';

@Controller('config')
class PublicConfigController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  /** Datos públicos que el cliente necesita al arrancar (base del CDN para emojis, límites). */
  @Public()
  @Get()
  get(): PublicConfig {
    return { cdnUrl: this.storage.publicBase, maxUploadBytes: MAX_ATTACHMENT_BYTES };
  }
}

@Global()
@Module({
  controllers: [PublicConfigController],
  providers: [StorageService, UploadsService],
  exports: [StorageService, UploadsService],
})
export class StorageModule {}
