import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { ReadStatesService } from './read-states.service';

/** Global: MessagesService y ServersService usan ReadStatesService. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [ReadStatesService],
  exports: [ReadStatesService],
})
export class NotificationsModule {}
