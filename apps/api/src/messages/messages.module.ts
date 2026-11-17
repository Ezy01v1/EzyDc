import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MentionsService } from './mentions.service';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MentionsService],
})
export class MessagesModule {}
