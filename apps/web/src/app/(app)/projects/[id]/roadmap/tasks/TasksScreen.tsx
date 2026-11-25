'use client';

import {
  MAX_TASK_EXPORT_BATCH,
  isWeeekLink,
  TRACKER_BASE_URL_MISSING,
  TaskExportOutcome,
  type ProjectTask,
  type ProjectTracker,
  type TaskExportResult,
} from '@cairn/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { describeApiError, summaryFailureOf } from '@/api';
import {
  useMutationCreateTask,
  useMutationDeleteTask,
  useMutationDetachTask,
  useMutationExportTasks,
  useMutationLinkTask,
  useMutationUpdateTask,
  useQueryPlatforms,
  useQueryProjectTracker,
  useQueryTasks,
} from '@/api/hooks';
import { CheckpointForm } from '@/components/CheckpointForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';

import { TrackerBindingPanel } from '../TrackerBindingPanel';
import { TaskExportCell } from './TaskExportCell';
import { TaskImportPanel } from './TaskImportPanel';
import { TaskExportSummary } from './TaskExportSummary';
import {
  EXPORT_TEXTS,
  ORIGIN_LABELS,
  TASKS_TEXTS,
  TASK_COLUMNS,
  TASK_COLUMNS_WITH_EXPORT,
  taskFailureTextOf,
} from './constants';

/**
 * Реестр задач проекта.
 *
 * Живёт под «Роадмапом», а не своим разделом: право на задачу — право на
 * «Роадмап», а список разделов закрыт составом секций. Поэтому и адрес
 * вложен в роадмап, и выдачу проверяет та же ручка.
 *
 * Фильтр живёт в адресе (`?loose`), как `?view` и `?tag`: ссылку на «что
 * не разложено по версиям» отправляют соседу, и состояние, спрятанное в
 * памяти компонента, такую ссылку сделать не позволяет.
 *
 * Платформы запрашиваются **мягко**: без выдачи на «Инфо» их не видно, и
 * тогда переключателей тегов просто не будет — отказ этого запроса не
 * повод показать экран ошибки вместо задач.
 *
 * Выгрузка в трекер живёт здесь же: отметки слева, колонка «Выгрузка»
 * справа, одна кнопка на набор. На установке без трекера ни отметок, ни
 * колонки, ни кнопки нет вовсе — та же лестница, что у загрузки записи при
 * выключенной расшифровке.
 */
export function TasksScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const isLoose = params.get('loose') === 'true';
  const tasks = useQueryTasks(projectId);
  const platforms = useQueryPlatforms(projectId);
  const tracker = useQueryProjectTracker(projectId);
  const create = useMutationCreateTask(projectId);
  const update = useMutationUpdateTask(projectId);
  const remove = useMutationDeleteTask(projectId);
  const detach = useMutationDetachTask(projectId);
  const exportTasks = useMutationExportTasks(projectId);
  const linkTask = useMutationLinkTask(projectId);
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [removing, setRemoving] = useState<ProjectTask | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  if (tasks.isPending) {
    return <Loader size="page" />;
  }

  if (tasks.isError || !tasks.data) {
    return (
      <p role="alert" className="text-destructive">
        {TASKS_TEXTS.loadFailed}
      </p>
    );
  }

  const rows = isLoose ? tasks.data.filter((task) => task.placement === null) : tasks.data;
  const failed = remove.error ?? exportTasks.error ?? linkTask.error;
  const failure = summaryFailureOf(failed);
  const error =
    (failure.code && taskFailureTextOf(failure.code)) ??
    describeApiError(failed ?? detach.error ?? update.error ?? create.error);

  // Колонка и отметки живут вместе с трекером: `base_url_missing` означает
  // «подключения не заводили вовсе», и тогда о выгрузке на экране нет ни
  // слова — установка без трекера полностью рабочая. Начатую настройку
  // (нет токена, снята галочка) наоборот называем: её кто-то начал и ждёт,
  // что выгрузка работает.
  const isExportVisible = isExportKnown(tracker.data) && !tracker.isError;

  // Уезжает только отмеченное **и видимое**: человек отметил, переключил
  // фильтр и видит одну строку — уехавшая вместе с ней скрытая задача была
  // бы правкой в чужом трекере, о которой на экране не сказано ничего.
  const chosen = rows.filter((task) => selected.has(task.id)).map((task) => task.id);
  const blocked = blockedReasonOf(tracker.data, chosen.length);

  // Итог последней выгрузки берётся из ответа ручки, а не из перечитанного
  // реестра: сервер отвечает `201` и когда обмен не удался, а при первом
  // неудачном обмене строки зеркала не возникает вовсе (контракт,
  // `taskExportResultSchema`) — то есть реестр о неудаче не знает ничего.
  const results = exportTasks.data;
  const attempts = attemptsOf(results);

  /** Переключение фильтра: состояние живёт в адресе, а не в памяти. */
  function toggleLoose(): void {
    router.replace(isLoose ? '?' : '?loose=true', { scroll: false });
  }

  /** Отметка строки: набор целиком, чтобы «что уедет» читалось одним местом. */
  function toggle(taskId: string, isOn: boolean): void {
    setSelected((current) => {
      const next = new Set(current);

      if (isOn) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }

      return next;
    });
  }

  /**
   * Выгрузка набора: отметка снимается только с уехавшего.
   *
   * Прежде удача снимала их все, и это была потеря: исход у набора не один,
   * а повтор — ровно то действие, которое человек сделает с неудавшейся и с
   * недошедшей задачей. Снять отметки значило бы отправить его искать те же
   * строки заново, по экрану, где о неудаче тогда не было сказано ничего.
   *
   * Отметка задачи, скрытой фильтром, не трогается вовсе: она не уезжала, и
   * снять её значило бы молча отменить выбор, которого на экране не видно, —
   * тот же инвариант, по которому уезжает только отмеченное **и видимое**.
   */
  function runExport(): void {
    exportTasks.mutate(chosen, {
      onSuccess: (done) => {
        const gone = new Set(done.filter(hasArrived).map((result) => result.taskId));

        setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
      },
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      {/*
        Привязка доски стоит здесь, а не на экране версий: она отвечает на
        «куда уедут задачи», и спрашивают это, глядя на сами задачи. На
        установке без трекера панель не рисуется вовсе — та же лестница, что
        у загрузки записи при выключенной расшифровке.
      */}
      <TrackerBindingPanel projectId={projectId} />

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={toggleLoose}
            aria-pressed={isLoose}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            {isLoose ? TASKS_TEXTS.filterAll : TASKS_TEXTS.filterLoose}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {tracker.data?.isOperational && (
              <TaskImportPanel projectId={projectId} binding={tracker.data.binding} />
            )}
            {isExportVisible && (
              <button
                type="button"
                onClick={runExport}
                disabled={blocked !== undefined || exportTasks.isPending}
                className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
              >
                {EXPORT_TEXTS.action}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {TASKS_TEXTS.create}
            </button>
          </div>
        </div>

        {/* Почему кнопка не нажимается — подписью, а не молчанием.
            Выключенная кнопка без причины отправляет человека к
            администратору с вопросом «почему», тогда как три из четырёх
            причин он чинит сам и на этом же экране. */}
        {isExportVisible && blocked !== undefined && (
          <p className="text-right text-sm text-muted-foreground">{blocked}</p>
        )}

        {/* Итог набора стоит у кнопки, которой его получили, а не в баннере
            отказов наверху: отказы там — про весь запрос (нет права, нет
            привязки, сеть), а здесь исход у каждой задачи свой, и бирки
            строк — продолжение этих же чисел. */}
        {results !== undefined && <TaskExportSummary results={results} />}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          {isLoose ? TASKS_TEXTS.emptyLoose : TASKS_TEXTS.empty}
        </p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {(isExportVisible ? TASK_COLUMNS_WITH_EXPORT : TASK_COLUMNS).map((column) => (
                <th key={column.key} className={`${column.width} px-2 py-2 font-medium`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => (
              <tr key={task.id} className="relative border-b border-border align-top">
                {isExportVisible && (
                  <td className="px-2 py-2">
                    {/* Область отметки растянута на всю строку
                        (`after:inset-0`): целят в строку, а не в квадратик
                        четырёх пикселей. Тот же приём, что у ссылки в
                        истории саммари, поэтому всё, что ниже по строке и
                        нажимается само, получает свой слой (`relative`). */}
                    <label className="flex items-center after:absolute after:inset-0">
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={(event) => toggle(task.id, event.target.checked)}
                        className="h-4 w-4"
                      />
                      <span className="sr-only">{EXPORT_TEXTS.select(task.title)}</span>
                    </label>
                  </td>
                )}
                <td className="px-2 py-2">
                  {/* Формулировка переносится по словам и видна целиком, а
                      не обрезается с подсказкой `title`. Подсказка здесь не
                      работала бы вовсе: область отметки растянута на всю
                      строку (`after:inset-0`) и перехватывает курсор, —
                      а доля колонки упала с 46% до 34%, когда появилась
                      колонка выгрузки, то есть обрезалось теперь и
                      короткое. Поднять формулировку своим слоем (`relative`,
                      как ссылки ниже) значило бы вернуть подсказку, которой
                      нет ни с клавиатуры, ни на телефоне, и отобрать у
                      самого крупного места строки нажатие отметки. Две-три
                      строки текста при `align-top` ничего не ломают. */}
                  <span className="block break-words">{task.title}</span>
                  {task.url && (
                    <a
                      href={task.url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block truncate text-xs text-muted-foreground underline"
                    >
                      {task.url}
                    </a>
                  )}
                </td>
                <td className="px-2 py-2">
                  {task.placement ? (
                    task.placement.versionLabel
                  ) : (
                    <span className="text-muted-foreground">{TASKS_TEXTS.loose}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-muted-foreground">{ORIGIN_LABELS[task.origin]}</td>
                {isExportVisible && (
                  <td className="px-2 py-2">
                    <TaskExportCell task={task} attempt={attempts.get(task.id) ?? null} />
                    {task.export === null && isWeeekLink(task.url) && (
                      <button type="button"
                        disabled={!tracker.data?.isOperational || !tracker.data.binding || linkTask.isPending}
                        onClick={() => linkTask.mutate(task.id)}
                        className="relative mt-2 rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                      >Связать с Weeek</button>
                    )}

                  </td>
                )}
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(task)}
                      className="relative rounded-md border border-border px-2 py-1 text-xs"
                    >
                      Править
                    </button>
                    {task.placement ? (
                      <button
                        type="button"
                        onClick={() => detach.mutate(task.id)}
                        className="relative rounded-md border border-border px-2 py-1 text-xs"
                      >
                        {TASKS_TEXTS.detach}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemoving(task)}
                        className="relative rounded-md border border-border px-2 py-1 text-xs"
                      >
                        {TASKS_TEXTS.remove}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Link href={`/projects/${projectId}/roadmap`} className="inline-block text-sm underline">
        {TASKS_TEXTS.back}
      </Link>

      {removing && (
        <ConfirmDialog
          label={TASKS_TEXTS.removeLabel}
          confirmLabel={TASKS_TEXTS.removeConfirm}
          onConfirm={() => {
            remove.mutate(removing.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        >
          {TASKS_TEXTS.removeQuestion}
        </ConfirmDialog>
      )}

      <Drawer
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title={TASKS_TEXTS.createTitle}
        width={DrawerWidth.Half}
      >
        <CheckpointForm
          submitLabel="Завести"
          {...(platforms.data && platforms.data.length > 0 ? { platforms: platforms.data } : {})}
          isSubmitting={create.isPending}
          onSubmit={(input) => {
            create.mutate(input, { onSuccess: () => setIsCreating(false) });
          }}
        />
      </Drawer>

      <Drawer
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={TASKS_TEXTS.editTitle}
        width={DrawerWidth.Half}
      >
        {editing && (
          <CheckpointForm
            initial={{
              title: editing.title,
              url: editing.url ?? null,
              platformIds: editing.platformIds,
            }}
            submitLabel="Сохранить"
            {...(platforms.data && platforms.data.length > 0 ? { platforms: platforms.data } : {})}
            isSubmitting={update.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(input) => {
              update.mutate(
                { taskId: editing.id, input },
                { onSuccess: () => setEditing(null) },
              );
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

/**
 * Итог последней выгрузки по задачам, разложенный по идентификатору.
 *
 * Нужен строкам: у задачи, чей первый обмен не удался, зеркала нет вовсе, и
 * причина отказа приходит только здесь. Картой, а не поиском по набору у
 * каждой строки: набор доходит до пятидесяти (`MAX_TASK_EXPORT_BATCH`), и
 * перебор на каждую строку — пятьдесят обходов пятидесяти элементов там, где
 * хватает одного.
 */
function attemptsOf(results: TaskExportResult[] | undefined): Map<string, TaskExportResult> {
  return new Map((results ?? []).map((result) => [result.taskId, result]));
}

/**
 * Уехала ли задача: завелась в трекере или исправилась там.
 *
 * `failed` и `skipped` сюда не попадают намеренно — с ними в трекере не
 * произошло ничего, и считать их уехавшими значило бы снять отметку ровно с
 * тех задач, которые человек сейчас повторит.
 */
function hasArrived(result: TaskExportResult): boolean {
  return (
    result.outcome === TaskExportOutcome.Created || result.outcome === TaskExportOutcome.Updated
  );
}

/**
 * Есть ли на установке трекер — то есть надо ли вообще говорить о выгрузке.
 *
 * Пока готовность неизвестна, колонки нет: лоадер или мигающая колонка
 * из-за трекера, который на этом экране дело десятое, хуже её отсутствия.
 */
function isExportKnown(tracker: ProjectTracker | undefined): tracker is ProjectTracker {
  return tracker !== undefined && tracker.blockedBy !== TRACKER_BASE_URL_MISSING;
}

/**
 * Почему выгрузить нельзя — одной фразой, или `undefined`, если можно.
 *
 * Порядок причин — порядок починки: сначала то, что чинит администратор,
 * потом то, что чинится на этом экране, и только потом отметки. Обратный
 * порядок просил бы отметить задачи, которым всё равно некуда ехать.
 */
function blockedReasonOf(tracker: ProjectTracker | undefined, chosen: number): string | undefined {
  if (tracker === undefined) {
    return EXPORT_TEXTS.blocked;
  }

  if (!tracker.isOperational) {
    return EXPORT_TEXTS.blocked;
  }

  if (tracker.binding === null) {
    return EXPORT_TEXTS.bindingMissing;
  }

  if (chosen === 0) {
    return EXPORT_TEXTS.nothingSelected;
  }

  // Предел — про срок ответа нашей ручки: выгрузка идёт по запросу на задачу
  // и последовательно, потому что чужой API считает частоту, а оборванный по
  // таймауту набор не сказал бы, сколько задач уже уехало, — повтор правил бы
  // в трекере уже уехавшее. Сам срок держит не это число, а бюджет времени на
  // сервере (`EXPORT_BATCH_BUDGET_MS`): пятьдесят медленных обменов вынесли бы
  // ответ за любой прокси. Здесь оно сказано человеку **до** нажатия, и этим
  // отличается от бюджета, о котором он узнаёт исходом «не пробовали».
  if (chosen > MAX_TASK_EXPORT_BATCH) {
    return EXPORT_TEXTS.tooMany(MAX_TASK_EXPORT_BATCH);
  }

  return undefined;
}
