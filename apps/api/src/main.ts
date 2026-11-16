import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { csrfMiddleware } from './common/csrf.middleware';
import { loadConfig } from './config/config';
import { RealtimeIoAdapter } from './realtime/io.adapter';

async function bootstrap(): Promise<void> {
  // Node ≥ 20.12 carga .env sin dependencias. En producción las variables vienen del proveedor.
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env: OK en producción */
  }
  const config = loadConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Railway/Render (y el rewrite de Vercel) están detrás de un proxy: IP real para rate limit.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(compression({ threshold: 1024 }));
  app.use(cookieParser());
  app.use(csrfMiddleware(config));
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('api');

  const io = new RealtimeIoAdapter(app, config);
  await io.connectRedis();
  app.useWebSocketAdapter(io);

  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(
    `API en http://localhost:${config.PORT}/api · Redis: ${config.REDIS_URL ? 'sí' : 'no (memoria)'}`,
  );
}

void bootstrap();
