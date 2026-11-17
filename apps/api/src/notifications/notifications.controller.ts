import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { AckInput, IdParam, NotificationSettingInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ReadStatesService } from './read-states.service';

@Controller()
export class NotificationsController {
  constructor(private readonly readStates: ReadStatesService) {}

  @Get('users/me/read-states')
  get(@CurrentUser() me: string) {
    return this.readStates.get(me);
  }

  @HttpCode(204)
  @Post('channels/:id/ack')
  ack(@CurrentUser() me: string, @Param('id', new ZodPipe(IdParam)) channelId: string, @Body(new ZodPipe(AckInput)) body: AckInput) {
    return this.readStates.ack(me, channelId, body.messageId);
  }

  @Put('users/me/notification-settings/:targetId')
  setSetting(
    @CurrentUser() me: string,
    @Param('targetId', new ZodPipe(IdParam)) targetId: string,
    @Body(new ZodPipe(NotificationSettingInput)) body: NotificationSettingInput,
  ) {
    return this.readStates.setSetting(me, targetId, body);
  }
}
