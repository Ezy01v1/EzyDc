import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateEmojiInput, EmojiUploadInput, IdParam, UpdateEmojiInput } from '@ezydc/shared';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmojisService } from './emojis.service';

const id = () => new ZodPipe(IdParam);

@Controller()
export class EmojisController {
  constructor(private readonly emojis: EmojisService) {}

  @Get('users/me/emojis')
  mine(@CurrentUser() me: string) {
    return this.emojis.listMine(me);
  }

  @Get('servers/:id/emojis')
  list(@CurrentUser() me: string, @Param('id', id()) serverId: string) {
    return this.emojis.list(serverId, me);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('servers/:id/emojis/upload')
  upload(@CurrentUser() me: string, @Param('id', id()) serverId: string, @Body(new ZodPipe(EmojiUploadInput)) body: EmojiUploadInput) {
    return this.emojis.requestUpload(serverId, me, body);
  }

  @Post('servers/:id/emojis')
  create(@CurrentUser() me: string, @Param('id', id()) serverId: string, @Body(new ZodPipe(CreateEmojiInput)) body: CreateEmojiInput) {
    return this.emojis.create(serverId, me, body);
  }

  @Patch('servers/:id/emojis/:emojiId')
  rename(
    @CurrentUser() me: string,
    @Param('id', id()) serverId: string,
    @Param('emojiId', id()) emojiId: string,
    @Body(new ZodPipe(UpdateEmojiInput)) body: UpdateEmojiInput,
  ) {
    return this.emojis.rename(serverId, emojiId, me, body);
  }

  @HttpCode(204)
  @Delete('servers/:id/emojis/:emojiId')
  remove(@CurrentUser() me: string, @Param('id', id()) serverId: string, @Param('emojiId', id()) emojiId: string) {
    return this.emojis.remove(serverId, emojiId, me);
  }
}
