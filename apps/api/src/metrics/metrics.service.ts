import { Injectable } from '@nestjs/common';

const WINDOW = 1000; // últimas N peticiones

/** Métricas en memoria, sin dependencias: latencia HTTP (p50/p95/p99), memoria y sockets. */
@Injectable()
export class MetricsService {
  private readonly durations = new Float64Array(WINDOW);
  private cursor = 0;
  private filled = 0;
  requests = 0;
  errors = 0;
  wsConnections = 0;

  record(ms: number, isError: boolean): void {
    this.durations[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % WINDOW;
    this.filled = Math.min(this.filled + 1, WINDOW);
    this.requests++;
    if (isError) this.errors++;
  }

  snapshot() {
    const sorted = Array.from(this.durations.subarray(0, this.filled)).sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!) : 0);
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.round(process.uptime()),
      http: { requests: this.requests, errors: this.errors, p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99) },
      ws: { connections: this.wsConnections },
      memory: { rssMb: mb(mem.rss), heapUsedMb: mb(mem.heapUsed), heapTotalMb: mb(mem.heapTotal) },
    };
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
const mb = (b: number) => Math.round(b / 1048576);
