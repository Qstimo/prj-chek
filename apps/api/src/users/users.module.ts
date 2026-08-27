import { forwardRef, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** Модуль управления пользователями. */
@Module({
  imports: [DbModule, AccessModule, AuthModule, forwardRef(() => InvitationsModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
