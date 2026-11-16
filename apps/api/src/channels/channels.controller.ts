import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CreateChannelInput, IdParam, ReorderChannelsInput, UpdateChannelInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ChannelsService } from './channels.service';

@Controller()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post('servers/:id/channels')
  create(
    @CurrentUser() userId: string,
    @Param('id', new ZodPipe(IdParam)) serverId: string,
    @Body(new ZodPipe(CreateChannelInput)) body: CreateChannelInput,
  ) {
    return this.channels.create(serverId, userId, body);
  }

  @HttpCode(204)
  @Patch('servers/:id/channels/positions')
  reorder(
    @CurrentUser() userId: string,
    @Param('id', new ZodPipe(IdParam)) serverId: string,
    @Body(new ZodPipe(ReorderChannelsInput)) body: ReorderChannelsInput,
  ) {
    return this.channels.reorder(serverId, userId, body);
  }

  @Patch('channels/:id')
  update(
    @CurrentUser() userId: string,
    @Param('id', new ZodPipe(IdParam)) id: string,
    @Body(new ZodPipe(UpdateChannelInput)) body: UpdateChannelInput,
  ) {
    return this.channels.update(id, userId, body);
  }

  @HttpCode(204)
  @Delete('channels/:id')
  remove(@CurrentUser() userId: string, @Param('id', new ZodPipe(IdParam)) id: string) {
    return this.channels.remove(id, userId);
  }
}
