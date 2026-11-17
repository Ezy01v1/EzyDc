import { Controller, Get, Global, Inject, Module } from '@nestjs/common';
import { MAX_ATTACHMENT_BYTES, type PublicConfig } from '@ezydc/shared';
import { Public } from '../auth/decorators';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { StorageService } from './storage.service';
import { UploadsService } from './uploads.service';

@Controller('config')
class PublicConfigController {
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Datos públicos que el cliente necesita al arrancar (CDN para emojis, límites, clave VAPID). */
  @Public()
  @Get()
  get(): PublicConfig {
    return {
      cdnUrl: this.storage.publicBase,
      maxUploadBytes: MAX_ATTACHMENT_BYTES,
      vapidPublicKey: this.cfg.VAPID_PUBLIC_KEY && this.cfg.VAPID_PRIVATE_KEY ? this.cfg.VAPID_PUBLIC_KEY : null,
    };
  }
}

@Global()
@Module({
  controllers: [PublicConfigController],
  providers: [StorageService, UploadsService],
  exports: [StorageService, UploadsService],
})
export class StorageModule {}
