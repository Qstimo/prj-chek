import {
  AccessLevel,
  Section,
  checkpointCarryOverSchema,
  linkTitleRequestSchema,
  platformReleaseSetSchema,
  roadmapCheckpointCreateSchema,
  roadmapCheckpointUpdateSchema,
  roadmapVersionCreateSchema,
  roadmapVersionUpdateSchema,
  type CheckpointCarryOver,
  type CheckpointCarryOverResult,
  type LinkTitleRequest,
  type LinkTitleResponse,
  type PlatformRelease,
  type PlatformReleaseSet,
  type PublicLink,
  type PublicReleaseReport,
  type PublicRoadmap,
  type ReleaseReport,
  type RoadmapCheckpoint,
  type RoadmapCheckpointCreate,
  type RoadmapCheckpointUpdate,
  type RoadmapResponse,
  type RoadmapVersionCreate,
  type RoadmapVersionUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LinkTitleService } from '../link-title';
import { RoadmapService } from './roadmap.service';

/** Секция «Роадмап» (спека 5). */
@Controller('projects/:projectId/roadmap')
@UseGuards(SessionGuard)
export class RoadmapController {
  constructor(
    private readonly roadmap: RoadmapService,
    private readonly access: AccessService,
    private readonly linkTitle: LinkTitleService,
  ) {}

  /**
   * Заголовок страницы по ссылке на задачу — чтобы не перепечатывать его
   * руками. Право то же, что у самого чекпоинта: адрес начинается с проекта
   * именно ради этого, отдельной проверки прав здесь не заводится.
   */
  @Post('link-title')
  async readLinkTitle(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(linkTitleRequestSchema)) body: LinkTitleRequest,
  ): Promise<LinkTitleResponse> {
    await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Write);

    return { title: await this.linkTitle.read(body.url) };
  }

  /** Роадмап проекта в проекции по уровню, со стадией. */
  @Get()
  async get(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<RoadmapResponse> {
    return this.roadmap.get(subject, projectId);
  }

  /** Создаёт версию в конце последовательности. */
  @Post('versions')
  async createVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(roadmapVersionCreateSchema)) body: RoadmapVersionCreate,
  ) {
    const created = await this.roadmap.createVersion(subject, projectId, body);

    return { id: created.id, label: created.label, position: created.position };
  }

  /** Правит версию. */
  @Patch('versions/:versionId')
  async updateVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(roadmapVersionUpdateSchema)) body: RoadmapVersionUpdate,
  ) {
    const updated = await this.roadmap.updateVersion(subject, projectId, versionId, body);

    return { id: updated.id, label: updated.label, position: updated.position };
  }

  /** Удаляет версию вместе с чекпоинтами. */
  @Delete('versions/:versionId')
  @HttpCode(204)
  async removeVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<void> {
    await this.roadmap.removeVersion(subject, projectId, versionId);
  }

  /** Создаёт чекпоинт. */
  @Post('versions/:versionId/checkpoints')
  async createCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(roadmapCheckpointCreateSchema)) body: RoadmapCheckpointCreate,
  ): Promise<RoadmapCheckpoint> {
    const created = await this.roadmap.createCheckpoint(subject, projectId, versionId, body);

    return {
      id: created.id,
      taskId: created.taskId,
      title: created.title,
      url: created.url,
      isDone: created.isDone,
      position: created.position,
      platformIds: created.platformIds,
    };
  }

  /** Правит чекпоинт: формулировку, признак, позицию. */
  @Patch('versions/:versionId/checkpoints/:checkpointId')
  async updateCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('checkpointId', ParseUUIDPipe) checkpointId: string,
    @Body(new ZodValidationPipe(roadmapCheckpointUpdateSchema)) body: RoadmapCheckpointUpdate,
  ): Promise<RoadmapCheckpoint> {
    const updated = await this.roadmap.updateCheckpoint(
      subject,
      projectId,
      versionId,
      checkpointId,
      body,
    );

    return {
      id: updated.id,
      taskId: updated.taskId,
      title: updated.title,
      url: updated.url,
      isDone: updated.isDone,
      position: updated.position,
      platformIds: updated.platformIds,
    };
  }

  /**
   * Переносит чекпоинт в другую версию.
   *
   * Своя ручка, а не `PATCH` с новым `versionId`: «найти или создать
   * целевую версию» обязано быть атомарным, и перенос обязан быть
   * отличим от переименования в журнале.
   *
   * Тело необязательно: пустое означает «следующая открытая версия».
   */
  @Post('versions/:versionId/checkpoints/:checkpointId/carry-over')
  async carryOverCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('checkpointId', ParseUUIDPipe) checkpointId: string,
    @Body(new ZodValidationPipe(checkpointCarryOverSchema)) body: CheckpointCarryOver,
  ): Promise<CheckpointCarryOverResult> {
    const carried = await this.roadmap.carryOverCheckpoint(
      subject,
      projectId,
      versionId,
      checkpointId,
      body,
    );

    return {
      checkpoint: {
        id: carried.checkpoint.id,
        taskId: carried.checkpoint.taskId,
        title: carried.checkpoint.title,
        url: carried.checkpoint.url,
        isDone: carried.checkpoint.isDone,
        position: carried.checkpoint.position,
        platformIds: carried.checkpoint.platformIds,
      },
      // Идентификатор берётся из самого чекпоинта: после переноса он и
      // есть версия-получатель, и второго источника правды тут нет.
      targetVersion: { id: carried.checkpoint.versionId, label: carried.toLabel },
      versionCreated: carried.versionCreated,
    };
  }

  /** Удаляет чекпоинт. */
  @Delete('versions/:versionId/checkpoints/:checkpointId')
  @HttpCode(204)
  async removeCheckpoint(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('checkpointId', ParseUUIDPipe) checkpointId: string,
  ): Promise<void> {
    await this.roadmap.removeCheckpoint(subject, projectId, versionId, checkpointId);
  }

  /**
   * Ставит выпуск платформы в версии.
   *
   * `PUT`, а не пара `POST`/`PATCH`: выпуск — не отдельная вещь со своим
   * адресом, а значение в клетке «версия × платформа». Повторный вызов
   * с тем же телом ничего не меняет, а не присланные поля обнуляются:
   * это полная замена клетки.
   */
  @Put('versions/:versionId/releases/:platformId')
  async setRelease(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body(new ZodValidationPipe(platformReleaseSetSchema)) body: PlatformReleaseSet,
  ): Promise<PlatformRelease> {
    return this.roadmap.setRelease(subject, projectId, versionId, platformId, body);
  }

  /** Снимает выпуск: платформа снова идёт «как у версии». */
  @Delete('versions/:versionId/releases/:platformId')
  @HttpCode(204)
  async clearRelease(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('platformId', ParseUUIDPipe) platformId: string,
  ): Promise<void> {
    await this.roadmap.clearRelease(subject, projectId, versionId, platformId);
  }

  /**
   * Отчёт по релизу версии.
   *
   * Ручки «одна версия» в секции нет: отчёт — третья проекция поверх той
   * же пачки данных, что роадмап, и своего адреса у версии не появляется.
   */
  @Get('versions/:versionId/report')
  async report(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<ReleaseReport> {
    return this.roadmap.report(subject, projectId, versionId);
  }

  /** Показывает ссылку на отчёт читающим: им её и рассылать. */
  @Get('versions/:versionId/report/public-link')
  async findReportLink(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<PublicLink> {
    const token = await this.roadmap.findReportLink(subject, projectId, versionId);

    if (!token) {
      throw new NotFoundException('Отчёт не опубликован');
    }

    return linkForms(token, REPORT_PATH);
  }

  /** Публикует отчёт версии. Раскрытие наружу — решение суперадмина. */
  @Post('versions/:versionId/report/public-link')
  @UseGuards(SessionGuard, SuperadminGuard)
  async publishReport(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<PublicLink> {
    return linkForms(await this.roadmap.publishReport(subject, projectId, versionId), REPORT_PATH);
  }

  /** Отключает публикацию отчёта: прежняя ссылка гаснет. */
  @Delete('versions/:versionId/report/public-link')
  @HttpCode(204)
  @UseGuards(SessionGuard, SuperadminGuard)
  async unpublishReport(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<void> {
    await this.roadmap.unpublishReport(subject, projectId, versionId);
  }

  /**
   * Показывает ссылку читающим: им её и рассылать.
   *
   * Право проверяет выборка, а не контроллер (ТЗ 4.1): субъект уходит в
   * репозиторий, и проверку нельзя забыть.
   */
  @Get('public-link')
  async findPublicLink(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<PublicLink> {
    const token = await this.roadmap.findPublicLink(subject, projectId);

    if (!token) {
      throw new NotFoundException('Роадмап не опубликован');
    }

    return linkForms(token);
  }

  /** Публикует роадмап. Раскрытие наружу — решение суперадмина. */
  @Post('public-link')
  @UseGuards(SessionGuard, SuperadminGuard)
  async publish(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<PublicLink> {
    return linkForms(await this.roadmap.publish(subject, projectId));
  }

  /** Отключает публикацию: прежняя ссылка гаснет. */
  @Delete('public-link')
  @HttpCode(204)
  @UseGuards(SessionGuard, SuperadminGuard)
  async unpublish(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.roadmap.unpublish(subject, projectId);
  }
}

/** Публичный роадмап: чтение по токену без сессии (ТЗ 3.5). */
@Controller('public/roadmap')
export class PublicRoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  /** Роадмап по токену. Мусорный и отключённый неразличимы. */
  @Get(':token')
  async get(@Param('token') token: string): Promise<PublicRoadmap> {
    const roadmap = await this.roadmap.publicRoadmap(token);

    if (!roadmap) {
      throw new NotFoundException();
    }

    return roadmap;
  }
}

/**
 * Публичный отчёт по релизу: чтение по токену без сессии.
 *
 * Своим контроллером, а не ручкой рядом с публичным роадмапом: у отчёта
 * свой токен и своя таблица ссылок, и общий адрес сделал бы один токен
 * годным для двух выдач.
 */
@Controller('public/roadmap-report')
export class PublicReleaseReportController {
  constructor(private readonly roadmap: RoadmapService) {}

  /** Отчёт по токену. Мусорный и отключённый неразличимы. */
  @Get(':token')
  async get(@Param('token') token: string): Promise<PublicReleaseReport> {
    const report = await this.roadmap.publicReport(token);

    if (!report) {
      throw new NotFoundException();
    }

    return report;
  }
}

/**
 * Ссылка в обеих формах: токен и готовый адрес страницы.
 *
 * Путь страницы аргументом: публичных страниц стало две, и второй
 * экземпляр этой сборки разошёлся бы с первым при переносе адреса.
 */
function linkForms(token: string, path = 'roadmap'): PublicLink {
  const base = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';

  return { token, url: `${base}/${path}/${token}` };
}

/** Путь публичной страницы отчёта на вебе. */
const REPORT_PATH = 'roadmap/report';
