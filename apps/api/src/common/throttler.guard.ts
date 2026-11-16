import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limit por usuario autenticado, o por IP si es anónimo. Solo HTTP. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    return super.canActivate(ctx);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const userId = (req.user as { id?: string } | undefined)?.id;
    return userId ? `u:${userId}` : `ip:${String(req.ip)}`;
  }
}
