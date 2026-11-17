import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateMessageInput, IdParam, MessageQuery, ReactionEmoji, RequestUploadsInput, UpdateMessageInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { MessagesService } from './messages.service';
import { ReactionsService } from './reactions.service';

@Controller('channels/:channelId')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly reactions: ReactionsService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('attachments')
  uploads(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Body(new ZodPipe(RequestUploadsInput)) body: RequestUploadsInput,
  ) {
    return this.messages.requestUploads(channelId, userId, body);
  }

  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  @HttpCode(204)
  @Put('messages/:messageId/reactions/:emoji/@me')
  react(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Param('messageId', new ZodPipe(IdParam)) messageId: string,
    @Param('emoji', new ZodPipe(ReactionEmoji)) emoji: string,
  ) {
    return this.reactions.add(channelId, messageId, userId, emoji);
  }

  @HttpCode(204)
  @Delete('messages/:messageId/reactions/:emoji/@me')
  unreact(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Param('messageId', new ZodPipe(IdParam)) messageId: string,
    @Param('emoji', new ZodPipe(ReactionEmoji)) emoji: string,
  ) {
    return this.reactions.remove(channelId, messageId, userId, emoji);
  }

  @Get('messages')
  list(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Query(new ZodPipe(MessageQuery)) q: MessageQuery,
  ) {
    return this.messages.list(channelId, userId, q);
  }

  @Throttle({ default: { limit: 10, ttl: 5_000 } }) // anti-spam: 10 mensajes / 5 s por usuario
  @Post('messages')
  create(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Body(new ZodPipe(CreateMessageInput)) body: CreateMessageInput,
  ) {
    return this.messages.create(channelId, userId, body);
  }

  @Patch('messages/:messageId')
  update(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Param('messageId', new ZodPipe(IdParam)) messageId: string,
    @Body(new ZodPipe(UpdateMessageInput)) body: UpdateMessageInput,
  ) {
    return this.messages.update(channelId, messageId, userId, body);
  }

  @HttpCode(204)
  @Delete('messages/:messageId')
  remove(
    @CurrentUser() userId: string,
    @Param('channelId', new ZodPipe(IdParam)) channelId: string,
    @Param('messageId', new ZodPipe(IdParam)) messageId: string,
  ) {
    return this.messages.remove(channelId, messageId, userId);
  }
}
