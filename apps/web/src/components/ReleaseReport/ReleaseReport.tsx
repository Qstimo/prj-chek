'use client';

import type { ReportRelease } from '@cairn/shared';
import type { ReactNode } from 'react';

import { formatDate } from '@/utils';

import { ReleaseSummary, RELEASE_STATE_LABELS } from '../ReleaseSummary';
import { STATE_LABELS } from '../VersionDrawer/constants';
import {
  BARE_REPORT_NOTE,
  DONE_LABEL,
  NO_RELEASE_LABEL,
  NOT_DONE_LABEL,
  SECTION_TITLES,
} from './constants';
import { CopyReport } from './CopyReport';
import type { CarriedOutCheckpointView, IProps, ReportCheckpointView } from './types';
import { checkpointUrlOf, isBareReport, platformNamesOf, tagsOf } from './utils';

/** Идентификаторы заголовков: по ним списки получают имя для читалок. */
const HEADING_IDS = {
  releases: 'release-report-releases',
  checkpoints: 'release-report-checkpoints',
  carriedOut: 'release-report-carried-out',
  summary: 'release-report-summary',
} as const;

/**
 * Отчёт по релизу версии (дизайн доводки, раздел 6).
 *
 * Один компонент на внутреннюю и публичную страницу: состав отчёта у них
 * один, и второй экземпляр разметки разошёлся бы с первым. Разница ровно
 * одна и живёт в данных — у публичной выдачи у чекпоинтов нет поля `url`
 * вовсе, поэтому ссылка на задачу наружу не уходит не «по условию», а по
 * отсутствию того, что можно было бы показать.
 *
 * Презентационный, данные только пропом: внутренняя страница берёт их из
 * кэша TanStack Query, публичная получает от серверного компонента и
 * TanStack Query не поднимает — так же устроена сводка релизов.
 *
 * Порядок разделов — порядок текста, который собирает сервер: отчёт
 * читают и копируют рядом, и расхождение порядка выглядело бы как разные
 * отчёты.
 */
export function ReleaseReport({ report }: IProps) {
  const { version } = report;
  const names = platformNamesOf(report.releases);
  // Присвоение в массив объединения, а не разбор на месте: у публичной
  // выдачи свой тип чекпоинта, и `map` по объединению массивов TypeScript
  // не разбирает.
  const checkpoints: ReportCheckpointView[] = report.checkpoints;
  const carriedOut: CarriedOutCheckpointView[] = report.carriedOut;

  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <h2 className="text-xl font-semibold">{version.label}</h2>

        <dl className="space-y-1 text-sm">
          <PassportRow name="Состояние">{STATE_LABELS[version.state]}</PassportRow>
          {version.plannedDate && (
            <PassportRow name="Плановая дата">{formatDate(version.plannedDate)}</PassportRow>
          )}
          {version.releasedDate && (
            <PassportRow name="Дата релиза">{formatDate(version.releasedDate)}</PassportRow>
          )}
          <PassportRow name="Чекпоинты">
            {version.progress.done} из {version.progress.total}
          </PassportRow>
          {/*
            Расхождение называется числом, а не словами: «выпущено, но не
            закрыто» без количества не говорит, насколько оно велико. Это
            пометка, а не отказ — выпуск с незакрытыми разрешён.
          */}
          {version.hasUnfinishedOnRelease && (
            <PassportRow name="Расхождение">
              <span className="text-destructive">
                Незакрыто на выпуске: {version.unfinished}
              </span>
            </PassportRow>
          )}
        </dl>

        <CopyReport markdown={report.markdown} text={report.text} />
      </header>

      {report.releases.length > 0 && (
        <section className="space-y-2">
          <h3 id={HEADING_IDS.releases} className="text-lg font-medium">
            {SECTION_TITLES.releases}
          </h3>
          <ul aria-labelledby={HEADING_IDS.releases} className="space-y-1 text-sm">
            {report.releases.map((row) => (
              <li key={row.platform.id}>{releaseLineOf(row)}</li>
            ))}
          </ul>
        </section>
      )}

      {checkpoints.length > 0 && (
        <section className="space-y-2">
          <h3 id={HEADING_IDS.checkpoints} className="text-lg font-medium">
            {SECTION_TITLES.checkpoints}
          </h3>
          <ul aria-labelledby={HEADING_IDS.checkpoints} className="space-y-1 text-sm">
            {checkpoints.map((checkpoint) => (
              <CheckpointLine
                key={checkpoint.id}
                checkpoint={checkpoint}
                names={names}
                note={checkpoint.carriedFrom ? `принято из ${checkpoint.carriedFrom}` : null}
              />
            ))}
          </ul>
        </section>
      )}

      {carriedOut.length > 0 && (
        <section className="space-y-2">
          {/*
            Унесённое — свой раздел, а не признак у чекпоинта версии: после
            переноса чекпоинт этой версии уже не принадлежит, и без раздела
            отчёт умолчал бы о том, что из релиза выпало.
          */}
          <h3 id={HEADING_IDS.carriedOut} className="text-lg font-medium">
            {SECTION_TITLES.carriedOut}
          </h3>
          <ul aria-labelledby={HEADING_IDS.carriedOut} className="space-y-1 text-sm">
            {carriedOut.map((checkpoint) => (
              <CheckpointLine
                key={checkpoint.id}
                checkpoint={checkpoint}
                names={names}
                note={`перенесено в ${checkpoint.carriedTo}`}
              />
            ))}
          </ul>
        </section>
      )}

      {report.summary.length > 0 && (
        <section className="space-y-2">
          <h3 id={HEADING_IDS.summary} className="text-lg font-medium">
            {SECTION_TITLES.summary}
          </h3>
          {/* Сводка та же, что наверху роадмапа: своей копии у отчёта нет. */}
          <ReleaseSummary summary={report.summary} />
        </section>
      )}

      {isBareReport(report) && (
        <p className="text-sm text-muted-foreground">{BARE_REPORT_NOTE}</p>
      )}
    </article>
  );
}

/**
 * Строка выпуска одной платформы.
 *
 * Одной строкой, как в тексте отчёта: состояние, дата и обозначение сборки
 * — свойства одного выпуска, и разнесённые по колонкам они читались бы
 * как отдельные сведения.
 */
function releaseLineOf(row: ReportRelease): string {
  const parts = [row.state === null ? NO_RELEASE_LABEL : RELEASE_STATE_LABELS[row.state]];

  if (row.releasedDate) {
    parts.push(formatDate(row.releasedDate));
  }

  if (row.buildLabel) {
    parts.push(`сборка ${row.buildLabel}`);
  }

  return `${row.platform.name}: ${parts.join(', ')}`;
}

/** Строка паспорта: подпись и значение. */
function PassportRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Строка чекпоинта: отметка слева, остальное — связный текст.
 *
 * Формулировка, платформы и след переноса лежат в одном текстовом блоке,
 * а не стоят соседними элементами гибкой строки. Соседними они и ломали
 * вёрстку: длинная формулировка — один неразрывный элемент, он не влезал
 * в строку и уезжал на свою, а платформы со следом переноса переносились
 * под отметку и читались как начало следующего чекпоинта.
 *
 * Отметка остаётся отдельным элементом и не сжимается: она колонка слева,
 * по которой список читается сверху вниз. `min-w-0` обязателен — без него
 * у элемента гибкой строки ширина не опускается ниже содержимого, и
 * длинная строка снова полезла бы за край.
 */
function CheckpointLine({
  checkpoint,
  names,
  note,
}: {
  checkpoint: ReportCheckpointView | CarriedOutCheckpointView;
  names: Map<string, string>;
  note: string | null;
}) {
  const tags = tagsOf(checkpoint.platformIds, names);

  return (
    <li className="flex items-baseline gap-2">
      <Mark isDone={checkpoint.isDone} />
      {/* Пробелы перед скобкой и следом переноса стоят внутри текста
          элементов: между соседними элементами JSX пробел не ставит,
          а здесь всё обязано читаться одной фразой. */}
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        <CheckpointTitle checkpoint={checkpoint} />
        {tags.length > 0 && (
          <span className="text-xs text-muted-foreground"> ({tags.join(', ')})</span>
        )}
        {note && <span className="text-muted-foreground"> {note}</span>}
      </span>
    </li>
  );
}

/** Отметка готовности словами: цвет — подсказка, а не носитель смысла. */
function Mark({ isDone }: { isDone: boolean }) {
  return (
    <span
      className={
        isDone
          ? 'shrink-0 rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-500'
          : 'shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      {isDone ? DONE_LABEL : NOT_DONE_LABEL}
    </span>
  );
}

/**
 * Формулировка чекпоинта, при внутренней выдаче — ссылкой на задачу.
 *
 * Адрес внешнего трекера показывается только внутри: наружу он не уходит
 * никогда, и в публичной выдаче его нет вовсе.
 */
function CheckpointTitle({
  checkpoint,
}: {
  checkpoint: ReportCheckpointView | CarriedOutCheckpointView;
}) {
  const url = checkpointUrlOf(checkpoint);

  if (!url) {
    return <span>{checkpoint.title}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="underline hover:no-underline"
    >
      {checkpoint.title}
    </a>
  );
}

