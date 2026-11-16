import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const start = performance.now();
    return next.handle().pipe(
      tap({
        next: () => this.metrics.record(performance.now() - start, false),
        error: () => this.metrics.record(performance.now() - start, true),
      }),
    );
  }
}
