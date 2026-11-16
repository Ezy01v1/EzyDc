import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z, ZodTypeAny } from 'zod';

/** Valida y transforma con un esquema zod de @ezydc/shared. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: result.error.issues[0]?.message ?? 'Datos inválidos',
        issues: result.error.flatten(),
      });
    }
    return result.data;
  }
}
