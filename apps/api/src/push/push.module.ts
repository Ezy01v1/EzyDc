import { Body, Controller, Delete, Global, HttpCode, Module, Post } from '@nestjs/common';
import { PushSubscriptionInput, PushUnsubscribeInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PushService } from './push.service';

@Controller('users/me/push-subscriptions')
class PushController {
  constructor(private readonly push: PushService) {}

  @HttpCode(204)
  @Post()
  subscribe(@CurrentUser() me: string, @Body(new ZodPipe(PushSubscriptionInput)) body: PushSubscriptionInput) {
    return this.push.subscribe(me, body);
  }

  @HttpCode(204)
  @Delete()
  unsubscribe(@CurrentUser() me: string, @Body(new ZodPipe(PushUnsubscribeInput)) body: PushUnsubscribeInput) {
    return this.push.unsubscribe(me, body.endpoint);
  }
}

@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
