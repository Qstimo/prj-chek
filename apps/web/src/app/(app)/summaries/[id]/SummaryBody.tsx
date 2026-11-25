'use client';

import { AccessLevel, Section } from '@cairn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLayoutEffect, useState } from 'react';

import { BROWSER_API_URL, describeApiError, summaryFailureOf } from '@/api';
import Link from 'next/link';
import { hasProjectTrackerConnection } from '@/api/trackerConnection';
import {
  SUMMARY_KEYS,
  useMutationArchiveSummaryTasks,
  useMutationReleaseSummary,
  useMutationRemoveSummaryTasks,
  useMutationRestoreSummaryTasks,
  useMutationRetryTranscription,
  useMutationSaveSummaryTasks,
  useMutationSuggestSummaryTasks,
  useMutationUpdateChronicleEntry,
  useQueryPublicLink,
  useQueryRoadmap,
  useQuerySections,
  useQuerySummary,
  useQueryTaskSuggester,
  useQueryProjectTracker,
} from '@/api/hooks';
import { ChronicleForm } from '@/components/ChronicleForm';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { SummaryRecording } from '@/components/SummaryRecording';
import { SummaryText } from '@/components/SummaryText';
import { useUnsavedWarning } from '@/hooks/useUnsavedWarning';

import { SUMMARY_TEXTS, failureMessageOf, releaseBlockedNoteOf, stateBadgesOf } from '../constants';
import { ReleaseDrawer } from './ReleaseDrawer';
import { SummaryHeader } from './SummaryHeader';
import { TasksBlock } from './TasksBlock';
import { TransferTasksDrawer, type TransferSelection } from './TransferTasksDrawer';
import type { IBodyProps } from './types';

/**
 * Рабочее место: слева запись и текст, справа задачи и релиз.
 *
 * Две колонки, а не лестница из четырёх блоков: решать по задаче, глядя
 * на текст, — ровно то, зачем экран существует, а в лестнице текст и
 * задачи никогда не видны одновременно (дизайн, 4.1). На узком экране
 * колонки складываются обратно в лестницу: две колонки на телефоне дали
 * бы две щели.
 *
 * Текст правится **существующей** ручкой записи хроники: вторая дверь к
 * нему разошлась бы с первой. После правки перечитывается и саммари —
 * `isTextStale` и сам текст считаются из той же записи.
 *
 * Несохранённые правки черновика живут здесь, а не в редакторе: о них
 * обязаны знать и шаг «Релиз» (он читает черновик из базы, и правка в
 * памяти уехала бы мимо), и уход со страницы.
 */
export function SummaryBody({ projectId, summaryId }: IBodyProps) {
  const client = useQueryClient();
  const router = useRouter();
  const detail = useQuerySummary(projectId, summaryId);
  const sections = useQuerySections(projectId);
  const suggester = useQueryTaskSuggester();
  const publicLink = useQueryPublicLink(projectId);
  // Право на релиз и право читать версии — одно и то же, поэтому список
  // версий для цели «существующая» берётся существующим запросом
  // роадмапа, а не новым полем детали (дизайн, 4.5). Без выдачи запрос
  // выключен: он ответил бы `404`, и спрашивать его незачем.
  const canRelease = sections.data?.[Section.Roadmap] === AccessLevel.Write;
  const roadmap = useQueryRoadmap(projectId, canRelease);
  const tracker = useQueryProjectTracker(projectId, canRelease);
  const hasTracker = hasProjectTrackerConnection(tracker?.data);
  const canExport = tracker?.data?.isOperational === true && !!tracker.data.binding && canRelease;
  const suggest = useMutationSuggestSummaryTasks(projectId, summaryId);
  const save = useMutationSaveSummaryTasks(projectId, summaryId);
  const archive = useMutationArchiveSummaryTasks(projectId, summaryId);
  const restore = useMutationRestoreSummaryTasks(projectId, summaryId);
  const remove = useMutationRemoveSummaryTasks(projectId, summaryId);
  const release = useMutationReleaseSummary(projectId, summaryId);
  const updateEntry = useMutationUpdateChronicleEntry(projectId);
  const retryTranscription = useMutationRetryTranscription();
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedTasks, setHasUnsavedTasks] = useState(false);
  // Отмеченные задачи, ждущие панели релиза. Список, а не признак
  // «панель открыта»: в ручку уедет ровно то, что было отмечено в момент
  // нажатия, а не то, что окажется отмеченным к отправке формы.
  const [releasing, setReleasing] = useState<string[]>();
  const [transferring, setTransferring] = useState<TransferSelection>();
  // Высота прилипшей шапки: её нельзя сосчитать заранее — заголовок
  // переносится, а бирок может не быть вовсе. Полоса действий редактора
  // прилипает под шапкой на эту высоту, иначе встаёт за ней.
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    if (!header) {
      return;
    }

    // Наблюдатель, а не одно измерение: высота меняется и от ширины
    // окна (заголовок переносится), и от появления бирок.
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight));

    observer.observe(header);
    setHeaderHeight(header.offsetHeight);

    return () => observer.disconnect();
  }, [header]);

  useUnsavedWarning(hasUnsavedTasks);

  if (detail.isPending || sections.isPending || suggester.isPending) {
    return <Loader size="page" />;
  }

  if (detail.isError || sections.isError || suggester.isError) {
    return (
      <p role="alert" className="text-destructive">
        {SUMMARY_TEXTS.loadFailed}
      </p>
    );
  }

  const summary = detail.data;
  const failure = summaryFailureOf(suggest.error);
  const isActing = archive.isPending || restore.isPending || remove.isPending;
  // Отказ любого из трёх действий называется одной строкой: они стоят в
  // одной полосе, и три места для одного отказа заняли бы её целиком.
  const actionError = describeApiError(archive.error ?? restore.error ?? remove.error);

  return (
    // Измеренная высота раздаётся вниз переменной: прилипшие слои ниже
    // встают под шапкой, не зная, из чего она сложилась.
    <div
      className="space-y-6"
      style={{ '--summary-header-h': `${headerHeight}px` } as React.CSSProperties}
    >
      <SummaryHeader
        ref={setHeader}
        projectName={summary.projectName}
        occurredOn={summary.occurredOn}
        title={summary.title}
        badges={stateBadgesOf(summary, suggest.isPending)}
      />

      {/* `items-start` обязателен: без него колонки тянутся до высоты
          соседки, и короткий текст уезжал бы вниз за задачами. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-8">
          {/* Блока нет вовсе, когда записи не было: «Запись недоступна» у
              текста, который никто не записывал, было бы рассказом о записи,
              которой не существовало (дизайн, 8.5). */}
          {(summary.recording !== null || summary.transcription !== null) && (
            <SummaryRecording
              recording={summary.recording}
              transcription={summary.transcription}
              src={`${BROWSER_API_URL}/projects/${projectId}/summaries/${summaryId}/recording`}
              isRetrying={retryTranscription.isPending}
              retryError={describeApiError(retryTranscription.error)}
              onRetry={() => retryTranscription.mutate({ projectId, summaryId })}
            />
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-medium">{SUMMARY_TEXTS.textHeading}</h2>
            <SummaryText
              text={summary.text}
              chronicleHref={`/projects/${projectId}/chronicle`}
              actions={
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-md border border-border px-3 py-1 text-sm"
                >
                  {SUMMARY_TEXTS.edit}
                </button>
              }
            />
          </section>
        </div>

        <div className="space-y-8">
          <TasksBlock
            summary={summary}
            suggester={suggester.data}
            onSuggest={() => suggest.mutate()}
            isSuggesting={suggest.isPending}
            suggestError={failureMessageOf(
              failure.code,
              failure.maxChars,
              describeApiError(suggest.error),
            )}
            onSave={(input) => save.mutate(input)}
            onDirtyChange={setHasUnsavedTasks}
            isSaving={save.isPending}
            saveError={describeApiError(save.error)}
            onRelease={setReleasing}
            onTransfer={(draftIds) => setTransferring({ draftIds, exportToWeeek: false })}
            onExport={
              hasTracker
                ? (draftIds) => setTransferring({ draftIds, exportToWeeek: true })
                : undefined
            }
            onExportTransferred={
              canExport ? (taskIds) => setTransferring({ taskIds, exportToWeeek: true }) : undefined
            }
            exportBlockedNote={
              hasTracker && !canExport
                ? 'Настройте доступное подключение и доску Weeek проекта.'
                : undefined
            }
            onArchive={(taskIds) => archive.mutate({ taskIds })}
            onRestore={(taskIds) => restore.mutate({ taskIds })}
            onDelete={(taskIds) => remove.mutate({ taskIds })}
            releaseBlockedNote={releaseBlockedNoteOf(sections.data[Section.Roadmap])}
            isActing={isActing}
            actionError={actionError}
          />
          {hasTracker && !canExport && canRelease && (
            <p className="text-sm text-muted-foreground">
              Для выгрузки нужна доска проекта и включённое подключение Weeek.{' '}
              <Link href={`/projects/${projectId}/tasks/settings`} className="underline">
                Настройки Weeek проекта
              </Link>
            </p>
          )}
        </div>
      </div>

      <ReleaseDrawer
        isOpen={releasing !== undefined}
        onClose={() => setReleasing(undefined)}
        suggestedLabel={summary.suggestedVersionLabel}
        taskCount={releasing?.length ?? 0}
        versions={(roadmap.data?.versions ?? []).map(({ id, label }) => ({ id, label }))}
        isRoadmapPublic={publicLink.data !== null && publicLink.data !== undefined}
        isReleasing={release.isPending}
        releaseError={failureMessageOf(
          summaryFailureOf(release.error).code,
          undefined,
          describeApiError(release.error),
        )}
        onRelease={(target) =>
          release.mutate(
            { taskIds: releasing ?? [], target },
            {
              onSuccess: (result) => {
                setReleasing(undefined);
                router.push(`/projects/${projectId}/roadmap?version=${result.versionId}`);
              },
            },
          )
        }
      />
      {transferring && (
        <TransferTasksDrawer
          projectId={projectId}
          summaryId={summaryId}
          selection={transferring}
          canExport={canExport}
          onClose={() => setTransferring(undefined)}
        />
      )}

      <Drawer
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title={SUMMARY_TEXTS.editTitle}
        width={DrawerWidth.Half}
      >
        <ChronicleForm
          initial={{
            occurredOn: summary.occurredOn,
            title: summary.title,
            content: summary.text,
          }}
          isSubmitting={updateEntry.isPending}
          error={describeApiError(updateEntry.error)}
          onSubmit={(input) =>
            updateEntry.mutate(
              { id: summary.chronicleEntryId, input },
              {
                onSuccess: async () => {
                  setIsEditing(false);
                  // Текст и `isTextStale` считаются из записи хроники:
                  // мутация записи о саммари не знает и его кэш не трогает.
                  await client.invalidateQueries({ queryKey: SUMMARY_KEYS.all });
                },
              },
            )
          }
        />
      </Drawer>
    </div>
  );
}
