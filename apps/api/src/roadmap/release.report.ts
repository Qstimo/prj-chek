import {
  PlatformReleaseState,
  RoadmapVersionState,
  type CarriedOutCheckpoint,
  type Platform,
  type PlatformRelease,
  type ReleaseReport,
  type ReleaseSummaryRow,
  type ReportCheckpoint,
  type ReportRelease,
  type RoadmapVersionDetail,
  type RoadmapVersionMetadata,
} from '@cairn/shared';

/**
 * Отчёт без текста: то, из чего текст и собирается.
 *
 * Отдельным типом, а не `ReleaseReport` с пустыми строками: сборщик текста
 * обязан принимать только данные, иначе его легко позвать с уже собранным
 * текстом и получить его же обратно.
 */
export type ReleaseReportBody = Omit<ReleaseReport, 'markdown' | 'text'>;

/** Что отчёту нужно знать помимо самой версии. */
export interface ReleaseReportContext {
  /**
   * Платформы проекта.
   *
   * Без них «идёт вместе с версией» не отличить от «платформ нет»: строка
   * выпуска есть только у платформы, ушедшей вперёд, и перечислить
   * остальные можно лишь по списку проекта.
   */
  platforms: Platform[];
  /** Сводка «что в релизе, что в пути» — та же, что наверху роадмапа. */
  summary: ReleaseSummaryRow[];
  /** Чекпоинт → обозначение версии, из которой его перенесли. */
  carriedFrom: Map<string, string>;
  /** Чекпоинты, уехавшие из этой версии в другие. */
  carriedOut: CarriedOutCheckpoint[];
}

/**
 * Отчёт по релизу версии вместе с готовым текстом (дизайн доводки, 6).
 *
 * Третья проекция поверх тех же данных, что роадмап. Принимает не строки
 * базы, а уже готовую проекцию версии и то немногое, что к ней нужно, —
 * так правило проверяется таблицей случаев без поднятого PostgreSQL.
 *
 * Проекция приходит готовой намеренно: второй экземпляр правила «что видно
 * на каком уровне» разошёлся бы с `versionProjection`, и отчёт стал бы
 * обходным путём к формулировкам чекпоинтов.
 *
 * Имён окружений и их здоровья здесь нет: роадмап не читает окружения —
 * это секция «Инфраструктура» (инвариант ТЗ 4.1).
 */
export function releaseReportOf(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
  context: ReleaseReportContext,
): ReleaseReport {
  const body = releaseReportBodyOf(version, context);

  return {
    ...body,
    markdown: releaseReportText(body, { markdown: true }),
    text: releaseReportText(body, { markdown: false }),
  };
}

/**
 * Данные отчёта без текста.
 *
 * Версия на уровне «метаданные» приходит без чекпоинтов и выпусков, и
 * отчёт обязан вести себя как панель: отдать паспорт, а не упасть на
 * `undefined`. Выпуски при этом молчат целиком — «идёт вместе с версией»
 * у неизвестного набора строк было бы выдумкой, а не умолчанием.
 */
export function releaseReportBodyOf(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
  { platforms, summary, carriedFrom, carriedOut }: ReleaseReportContext,
): ReleaseReportBody {
  const detail = 'checkpoints' in version ? version : null;

  return {
    // Паспорт собирается по полям, а не спредом проекции: публичная схема
    // отчёта строга, и приехавшие вместе с проекцией `checkpoints` стали
    // бы для неё ошибкой — что и требуется.
    version: {
      id: version.id,
      label: version.label,
      state: version.state,
      plannedDate: version.plannedDate,
      releasedDate: version.releasedDate,
      position: version.position,
      progress: version.progress,
      unfinished: version.unfinished,
      hasUnfinishedOnRelease: version.hasUnfinishedOnRelease,
    },
    releases: detail ? releasesOf(platforms, detail.releases) : [],
    summary,
    checkpoints: detail
      ? detail.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          carriedFrom: carriedFrom.get(checkpoint.id) ?? null,
        }))
      : [],
    carriedOut: detail ? carriedOut : [],
  };
}

/**
 * Текст отчёта: разметкой Markdown либо без неё.
 *
 * Один сборщик на оба вида, а не два текста: кнопки «Скопировать Markdown»
 * и «Скопировать текст» обязаны давать одно и то же, и вид отличается
 * только маркерами.
 *
 * Собирается на сервере, потому что тот же текст получает публичная
 * страница: повторить правило на клиенте значило бы разойтись с ним при
 * первой же правке.
 *
 * Ссылка на задачу в текст не попадает ни при каком виде. Отчёт копируют в
 * письмо и в чат, и адрес внутреннего трекера с номером задачи не нужен ни
 * внутри, ни наружу; заодно внутренний и публичный тексты совпадают
 * побайтово, а не «почти».
 *
 * Разметка в формулировках не экранируется: страница рисует Markdown
 * собственным безопасным рендером, и худшее, что сделает `#` в заголовке
 * версии, — лишний заголовок.
 */
export function releaseReportText(
  report: ReleaseReportBody,
  { markdown }: { markdown: boolean },
): string {
  const heading = (text: string) => (markdown ? `## ${text}` : text);
  const bullet = (text: string) => (markdown ? `- ${text}` : text);
  const names = new Map(report.releases.map((row) => [row.platform.id, row.platform.name]));

  const blocks: string[][] = [
    [markdown ? `# ${TITLE} ${report.version.label}` : `${TITLE} ${report.version.label}`],
    passportOf(report.version).map(bullet),
  ];

  if (report.releases.length > 0) {
    blocks.push([heading('Выпуски')], report.releases.map((row) => bullet(releaseLineOf(row))));
  }

  if (report.checkpoints.length > 0) {
    blocks.push(
      [heading('Чекпоинты')],
      report.checkpoints.map((checkpoint) =>
        markdown
          ? `- [${checkpoint.isDone ? 'x' : ' '}] ${checkpointLineOf(checkpoint, names)}`
          : `[${checkpoint.isDone ? 'готово' : 'не закрыт'}] ${checkpointLineOf(checkpoint, names)}`,
      ),
    );
  }

  if (report.carriedOut.length > 0) {
    blocks.push(
      [heading('Перенесено в другие версии')],
      report.carriedOut.map((checkpoint) =>
        bullet(`${titleWithTags(checkpoint, names)} — перенесено в ${checkpoint.carriedTo}`),
      ),
    );
  }

  if (report.summary.length > 0) {
    blocks.push(
      [heading('Что в релизе, что в пути')],
      report.summary.map((row) => bullet(summaryLineOf(row))),
    );
  }

  return blocks.map((lines) => lines.join('\n')).join('\n\n');
}

/** Паспорт версии строками: только то, что известно. */
function passportOf(version: ReleaseReportBody['version']): string[] {
  const lines = [
    `Состояние: ${VERSION_STATE_LABELS[version.state]}`,
    `План: ${version.plannedDate ?? 'не задан'}`,
  ];

  // Фактическая дата печатается только когда она есть: «не выпущена»
  // читается из состояния, и повторять это второй строкой незачем.
  if (version.releasedDate) {
    lines.push(`Факт: ${version.releasedDate}`);
  }

  if (version.progress.total > 0) {
    lines.push(`Чекпоинты: ${version.progress.done} из ${version.progress.total}`);
  }

  // Расхождение называется числом, а не словами: «выпущено, но не закрыто»
  // без количества не говорит, насколько велико расхождение.
  if (version.hasUnfinishedOnRelease) {
    lines.push(`Незакрыто на выпуске: ${version.unfinished}`);
  }

  return lines;
}

/** Строка выпуска: платформа, состояние словами, дата и сборка. */
function releaseLineOf(row: ReportRelease): string {
  const parts = [row.state === null ? NO_RELEASE_LABEL : RELEASE_STATE_LABELS[row.state]];

  if (row.releasedDate) {
    parts.push(row.releasedDate);
  }

  if (row.buildLabel) {
    parts.push(`сборка ${row.buildLabel}`);
  }

  return `${row.platform.name}: ${parts.join(', ')}`;
}

/** Строка чекпоинта без маркера готовности: он зависит от вида текста. */
function checkpointLineOf(checkpoint: ReportCheckpoint, names: Map<string, string>): string {
  const title = titleWithTags(checkpoint, names);

  return checkpoint.carriedFrom ? `${title} — принято из ${checkpoint.carriedFrom}` : title;
}

/**
 * Формулировка вместе с тегами платформ.
 *
 * Неизвестный тег пропускается молча: такого быть не может, пока теги
 * уходят вместе с платформой, а падать в отчёте хуже, чем не назвать
 * платформу.
 */
function titleWithTags(
  checkpoint: { title: string; platformIds: string[] },
  names: Map<string, string>,
): string {
  const tags = checkpoint.platformIds
    .map((platformId) => names.get(platformId))
    .filter((name): name is string => name !== undefined);

  return tags.length > 0 ? `${checkpoint.title} (${tags.join(', ')})` : checkpoint.title;
}

/**
 * Строка сводки: что у платформы в релизе и что идёт за ним.
 *
 * Обозначение сборки здесь не повторяется: у версии этого отчёта оно уже
 * названо в разделе «Выпуски», а у чужих версий сводке важна не сборка, а
 * порядок.
 */
function summaryLineOf(row: ReleaseSummaryRow): string {
  const released = row.released
    ? `в релизе ${row.released.versionLabel}${row.released.date ? ` (${row.released.date})` : ''}`
    : 'в релизе ничего';

  const pending = row.pending
    .map((item) => `${item.versionLabel} — ${RELEASE_STATE_LABELS[item.state]}`)
    .join(', ');

  return `${row.platform.name}: ${released}${pending ? `; в пути ${pending}` : ''}`;
}

/** Заголовок отчёта: за ним идёт обозначение версии. */
const TITLE = 'Отчёт по релизу';

/**
 * Подписи состояний версии на языке интерфейса.
 *
 * Свой экземпляр, а не общий с вебом: текст собирается на сервере, и
 * тянуть его подписи из компонента страницы значило бы развернуть
 * зависимость наизнанку. Расхождение подписей заметно глазами в тот же
 * день — в отличие от расхождения правил сборки, ради которого текст
 * и переехал на сервер.
 */
const VERSION_STATE_LABELS: Record<RoadmapVersionState, string> = {
  [RoadmapVersionState.Planned]: 'Запланирована',
  [RoadmapVersionState.InProgress]: 'В работе',
  [RoadmapVersionState.Released]: 'Выпущена',
};

/** Подписи состояний выпуска. Новое состояние обязано получить подпись. */
const RELEASE_STATE_LABELS: Record<PlatformReleaseState, string> = {
  [PlatformReleaseState.OnTest]: 'на тесте',
  [PlatformReleaseState.InReview]: 'на модерации',
  [PlatformReleaseState.Released]: 'вышла',
  [PlatformReleaseState.Rejected]: 'отклонена',
};

/**
 * Платформа без строки выпуска.
 *
 * Словами, а не прочерком: отсутствие строки означает «едет вместе с
 * версией», и в тексте, который читают в письме, прочерк прочли бы как
 * «неизвестно».
 */
const NO_RELEASE_LABEL = 'идёт вместе с версией';

/** Выпуски версии по всем платформам проекта, включая не ушедшие вперёд. */
function releasesOf(platforms: Platform[], releases: PlatformRelease[]): ReportRelease[] {
  const byPlatform = new Map(releases.map((release) => [release.platformId, release]));

  return platforms.map((platform) => {
    const own = byPlatform.get(platform.id);

    return {
      platform,
      state: own?.state ?? null,
      releasedDate: own?.releasedDate ?? null,
      buildLabel: own?.buildLabel ?? null,
    };
  });
}
