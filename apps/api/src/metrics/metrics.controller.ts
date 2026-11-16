import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PrismaService } from '../core/prisma.service';
import { MetricsService } from './metrics.service';

@Public()
@SkipThrottle()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Health check para Railway/Render. */
  @Get('health')
  async health(): Promise<{ ok: boolean; db: boolean }> {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return { ok: true, db };
  }

  @Get('metrics')
  get(@Headers('x-metrics-token') token?: string) {
    if (this.cfg.METRICS_TOKEN && token !== this.cfg.METRICS_TOKEN) throw new UnauthorizedException();
    return this.metrics.snapshot();
  }
}
