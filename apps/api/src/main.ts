import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'POST' && req.url?.startsWith('/payments')) {
      console.log(`[payments] POST ${req.url}`);
    }
    next();
  });
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`SureDriver API running on port ${port}`);
}

bootstrap();
