import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { LinkTitleModule } from '../link-title';
import {
  PublicReleaseReportController,
  PublicRoadmapController,
  RoadmapController,
} from './roadmap.controller';
import { RoadmapRepository } from './roadmap.repository';
import { RoadmapService } from './roadmap.service';

/** Модуль секции «Роадмап». */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule, LinkTitleModule],
  controllers: [RoadmapController, PublicRoadmapController, PublicReleaseReportController],
  providers: [RoadmapRepository, RoadmapService],
  exports: [RoadmapRepository, RoadmapService],
})
export class RoadmapModule {}
