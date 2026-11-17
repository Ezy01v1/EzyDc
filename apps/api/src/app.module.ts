import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { UserThrottlerGuard } from './common/throttler.guard';
import { APP_CONFIG, type AppConfig } from './config/config';
import { CoreModule } from './core/core.module';
import { DmsModule } from './dms/dms.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RolesModule } from './roles/roles.module';
import { ServersModule } from './servers/servers.module';
import { StorageModule } from './storage/storage.module';
import { PushModule } from './push/push.module';
import { EmojisModule } from './emojis/emojis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    CoreModule,
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({ secret: cfg.JWT_ACCESS_SECRET }),
    }),
    // Límite general: 120 req/min por usuario (o IP si anónimo). Auth tiene límites propios.
    // Multi-instancia: cambiar a un storage Redis (ver docs/05-roadmap.md).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuthModule,
    UsersModule,
    StorageModule,
    PushModule,
    ServersModule,
    EmojisModule,
    ChannelsModule,
    MessagesModule,
    RolesModule,
    DmsModule,
    NotificationsModule,
    RealtimeModule,
    MetricsModule,
  ],
  providers: [
    // Orden importa: primero autenticamos (req.user) y luego limitamos por usuario.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
