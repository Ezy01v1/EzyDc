import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config/config';
import { CacheService } from './cache.service';
import { PermissionsService } from './permissions.service';
import { PrismaService } from './prisma.service';
import { RealtimeService } from './realtime.service';

/** Servicios transversales disponibles en toda la app. */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: loadConfig },
    PrismaService,
    CacheService,
    PermissionsService,
    RealtimeService,
  ],
  exports: [APP_CONFIG, PrismaService, CacheService, PermissionsService, RealtimeService],
})
export class CoreModule {}
