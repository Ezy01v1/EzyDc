import { Module } from '@nestjs/common';
import { EmojisModule } from '../emojis/emojis.module';
import { PreviewsService } from '../previews/previews.service';
import { MessagesController } from './messages.controller';
import { MentionsService } from './mentions.service';
import { MessagesService } from './messages.service';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [EmojisModule],
  controllers: [MessagesController],
  providers: [MessagesService, MentionsService, ReactionsService, PreviewsService],
})
export class MessagesModule {}
