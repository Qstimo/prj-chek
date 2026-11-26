import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { TaskPlanningRepository } from './task-planning.repository';

@Module({
  imports: [AccessModule],
  providers: [TaskPlanningRepository],
  exports: [TaskPlanningRepository],
})
export class TaskPlanningModule {}
