import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateMessageInput, IdParam, MessageQuery, UpdateMessageInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { MessagesService } from './messages.service';

@Controller('channels/:channelId/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Query(new ZodPipe(MessageQuery)) q: MessageQuery,
  ) {
    return this.messages.list(channelId, userId, q);
  }

  @Throttle({ default: { limit: 10, ttl: 5_000 } }) // anti-spam: 10 mensajes / 5 s por usuario
  @Post()
  create(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Body(new ZodPipe(CreateMessageInput)) body: CreateMessageInput,
  ) {
    return this.messages.create(channelId, userId, body);
  }

  @Patch(':messageId')
  update(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Param('messageId', new ZodPipe(IdParam)) messageId: string,
    @Body(new ZodPipe(UpdateMessageInput)) body: UpdateMessageInput,
  ) {
    return this.messages.update(channelId, messageId, userId, body);
  }

  @HttpCode(204)
  @Delete(':messageId')
  remove(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Param('messageId', new ZodPipe(IdParam)) messageId: string,
  ) {
    return this.messages.remove(channelId, messageId, userId);
  }
}
