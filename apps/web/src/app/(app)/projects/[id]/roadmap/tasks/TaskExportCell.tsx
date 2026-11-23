'use client';

import { TaskExportOutcome, type ProjectTask, type TaskExportResult } from '@cairn/shared';

import { EXPORT_TEXTS, exportFailureTextOf } from './constants';

/**
 * Клетка выгрузки: бирка состояния, время опроса и ссылка в трекер.
 *
 * Зеркало и только зеркало (дизайн, 5): здесь нет ни одного действия,
 * которое что-нибудь закрывает. Чекпоинт закрывает человек, прогресс версии
 * считается только из чекпоинтов, а «закрыта там, открыта здесь» —
 * законное состояние, названное биркой. Кнопка «закрыть по трекеру» означала
 * бы, что упавший опрос, снятый токен или переименованная колонка молча
 * двигают прогресс роадмапа.
 *
 * Время опроса стоит у каждой выгруженной задачи, а не одной строкой наверху
 * экрана: прогон опрашивает задачу за задачей и о каждой узнаёт в своё время
 * — общая строка «опрошено тогда-то» была бы верна не про все.
 *
 * `attempt` — итог последней выгрузки по этой задаче, `null` — её не было.
 * Поле обязательно и не имеет умолчания намеренно: клетка, которой итог не
 * передали, молчала бы о неудаче, не отличимо от клетки, у которой итога
 * нет, — а это и был дефект, из-за которого задача оставалась «Не
 * выгружена» без единого слова о том, почему.
 */
export function TaskExportCell({
  task,
  attempt,
}: {
  task: ProjectTask;
  attempt: TaskExportResult | null;
}) {
  const mirror = task.export;
  // Код только что неудавшейся выгрузки главнее кода зеркала: при первом
  // неудачном обмене строки зеркала не возникает вовсе (контракт,
  // `taskExportResultSchema`), а когда строка есть, её код мог прийти и от
  // прогона опроса — тот пишет туда свою неудачу тоже. Из двух выбран тот,
  // о котором человек только что попросил сам.
  const failureCode =
    (attempt?.outcome === TaskExportOutcome.Failed ? attempt.failureCode : null) ??
    mirror?.failureCode ??
    null;

  if (mirror === null) {
    return (
      <div className="space-y-1">
        <Badge tone="bg-muted text-muted-foreground">{EXPORT_TEXTS.none}</Badge>
        {failureCode !== null && <FailureBadge code={failureCode} />}
      </div>
    );
  }

  // Расхождение — только когда закрытой **там** задаче здесь отвечает
  // незакрытый чекпоинт. У задачи вне версии закрывать нечего, и назвать её
  // расхождением значило бы требовать действия, которого нет.
  const isDivergent = mirror.isCompleted && task.placement !== null && !task.placement.isDone;

  return (
    <div className="space-y-1">
      {!mirror.isCompleted ? (
        <Badge tone="bg-accent-soft text-accent-soft-foreground">{EXPORT_TEXTS.exported}</Badge>
      ) : isDivergent ? (
        <Badge tone="bg-amber-500/10 text-amber-600 dark:text-amber-500">
          {EXPORT_TEXTS.divergent}
        </Badge>
      ) : (
        <Badge tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          {EXPORT_TEXTS.completedThere}
        </Badge>
      )}

      {/* Отказ обмена стоит **рядом** с состоянием, а не вместо него:
          прежнее зеркало от неудачи не перестаёт быть известным, и
          подменить его отказом значило бы потерять единственное, что о
          задаче в трекере знают. */}
      {failureCode !== null && <FailureBadge code={failureCode} />}

      <p className="text-xs text-muted-foreground">
        {mirror.checkedAt === null
          ? EXPORT_TEXTS.checkedNever
          : EXPORT_TEXTS.checkedAt(new Date(mirror.checkedAt).toLocaleString('ru-RU'))}
      </p>

      {/* Ссылка наружу своим слоем (`relative`): область отметки растянута
          на всю строку, и без слоя нажатие на ссылку попадало бы в галочку.
          Тот же приём, что у ссылки на версию в истории саммари и у внешней
          ссылки домена в сводке проектов.

          Ссылки задачи (`task.url`) она не заменяет: ту вписал человек, и
          выгрузка её не перезаписывает (дизайн, 3.1). Пусто означает «формат
          ссылки трекера нам неизвестен» (дизайн, 10.4), а не «задачи там
          нет», поэтому отсутствие ссылки ничего о выгрузке не меняет. */}
      {mirror.externalUrl !== null && (
        <a
          href={mirror.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="relative block truncate text-xs underline"
        >
          {EXPORT_TEXTS.open}
        </a>
      )}
    </div>
  );
}

/**
 * Бирка отказа обмена: фраза по коду, незнакомый код — как есть.
 *
 * Своим компонентом, потому что рисуется из двух ветвей: у задачи без
 * зеркала (первый обмен не удался) и у задачи с зеркалом (повторный). Фраза
 * берётся одной функцией контрактных карт — второго словаря кодов на экране
 * нет и не должно быть.
 */
function FailureBadge({ code }: { code: string }) {
  return <Badge tone="bg-destructive/10 text-destructive">{exportFailureTextOf(code)}</Badge>;
}

/** Бирка состояния: оформление приходит снаружи, текст — изнутри. */
function Badge({ tone, children }: { tone: string; children: string }) {
  return (
    <span
      className={`inline-block max-w-full rounded-full px-2 py-0.5 text-xs ${tone}`}
      title={children}
    >
      {children}
    </span>
  );
}
