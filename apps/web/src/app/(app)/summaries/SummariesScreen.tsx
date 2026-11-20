'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { describeApiError, summaryFailureOf } from '@/api';
import {
  useMutationCancelTranscription,
  useMutationCreateSummary,
  useMutationDeleteTranscription,
  useMutationRetryTranscription,
  useMutationUploadRecording,
  useQuerySummaries,
  useQuerySummaryTargets,
  useQueryTranscriber,
  useQueryTranscriptions,
} from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { SummaryForm, recordingErrorOf } from '@/components/SummaryForm';
import { SummaryList } from '@/components/SummaryList';
import { TranscriptionQueue } from '@/components/TranscriptionQueue';
import { useFileDrop } from '@/hooks/useFileDrop';

import { SCREEN_TEXTS } from './constants';

/**
 * История саммари, очередь расшифровок и создание нового.
 *
 * Проект выбирается в форме, а не адресом экрана: вкладка сводная по всем
 * проектам, куда субъект может писать хронику (дизайн, раздел 7.2).
 *
 * Очередь и настройки службы в условие загрузки экрана **не входят**: это
 * не история, и их отказ не повод показать экран ошибки вместо саммари.
 * Нет настроек — нет и третьего способа дать текст, и это ровно то, что
 * видит человек на установке без расшифровки.
 *
 * Файл, брошенный на страницу, открывает панель создания с ним в руках:
 * запись созвона человек берёт из папки выгрузки, и путь «бросил» короче
 * пути «нажал, нашёл, выбрал» ровно на диалог. Саммари при этом **не
 * создаётся само**: заголовок — поле паспорта записи хроники, и выдумать
 * его за человека нечем, а именем файла заполнить его нельзя — имена
 * файлов наружу не уходят вовсе (дизайн расшифровки, 5.2).
 */
export function SummariesScreen() {
  const router = useRouter();
  const summaries = useQuerySummaries();
  const targets = useQuerySummaryTargets();
  const transcriptions = useQueryTranscriptions();
  const transcriber = useQueryTranscriber();
  const [isCreating, setIsCreating] = useState(false);
  const [dropped, setDropped] = useState<File>();
  const [percent, setPercent] = useState<number>();
  const upload = useRef<AbortController | undefined>(undefined);
  const create = useMutationCreateSummary();
  const uploadRecording = useMutationUploadRecording();
  const cancel = useMutationCancelTranscription();
  const remove = useMutationDeleteTranscription();
  const retry = useMutationRetryTranscription();
  // Бросок открывает панель с файлом; пока она открыта, бросок на
  // страницу выключен — поле самой панели принимает его само, и вторая
  // панель на тот же файл была бы лишней.
  const isDragging = useFileDrop(
    useCallback((file: File) => {
      setDropped(file);
      setIsCreating(true);
    }, []),
    !isCreating,
  );

  /** Закрытие панели: брошенный файл уходит вместе с ней. */
  function close(): void {
    setIsCreating(false);
    setDropped(undefined);
  }

  if (summaries.isPending || targets.isPending) {
    return <Loader size="page" />;
  }

  if (summaries.isError || targets.isError) {
    return (
      <p role="alert" className="text-destructive">
        {SCREEN_TEXTS.loadFailed}
      </p>
    );
  }

  const settings = transcriber.data;
  const failure = summaryFailureOf(uploadRecording.error);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          {SCREEN_TEXTS.create}
        </button>
      </div>

      <TranscriptionQueue
        jobs={transcriptions.data ?? []}
        onCancel={(job) => cancel.mutate({ projectId: job.projectId, jobId: job.id })}
        onDelete={(job) => remove.mutate({ projectId: job.projectId, jobId: job.id })}
        onRetry={(job) => {
          if (job.summaryId !== null) {
            retry.mutate({ projectId: job.projectId, summaryId: job.summaryId });
          }
        }}
      />

      <SummaryList items={summaries.data} />

      {isDragging && (
        <div
          // Поверх страницы, но под панелью: пока панель открыта, броска
          // на страницу нет вовсе, и подсказка с ней не встречается.
          // Мышь сквозь подсказку проходит, иначе бросок пришёлся бы
          // в неё, а не в страницу.
          className="pointer-events-none fixed inset-4 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-border-strong bg-background/80"
        >
          <p className="rounded-md border border-border bg-surface px-4 py-2 text-sm">
            {SCREEN_TEXTS.dropHint}
          </p>
        </div>
      )}

      <Drawer
        isOpen={isCreating}
        onClose={close}
        title={SCREEN_TEXTS.create}
        width={DrawerWidth.Half}
      >
        <SummaryForm
          projects={targets.data}
          isSubmitting={create.isPending}
          {...(dropped === undefined ? {} : { droppedFile: dropped })}
          error={describeApiError(create.error)}
          {...(settings === undefined
            ? {}
            : {
                recording: {
                  transcriber: settings,
                  ...(percent === undefined ? {} : { percent }),
                  onCancel: () => upload.current?.abort(),
                  error:
                    failure.code === undefined
                      ? describeApiError(uploadRecording.error)
                      : (recordingErrorOf(failure.code, settings, failure.maxBytes) ??
                        describeApiError(uploadRecording.error)),
                  onSubmit: (projectId, passport, read) => {
                    const controller = new AbortController();

                    upload.current = controller;
                    setPercent(0);
                    uploadRecording.mutate(
                      {
                        projectId,
                        passport,
                        recording: read,
                        onProgress: setPercent,
                        signal: controller.signal,
                      },
                      {
                        // Панель закрывается на успехе: саммари ещё нет,
                        // и переходить некуда — в списке появилась строка
                        // очереди (дизайн, 8.2).
                        onSuccess: close,
                        onSettled: () => setPercent(undefined),
                      },
                    );
                  },
                },
              })}
          onSubmit={(projectId, input) =>
            create.mutate(
              { projectId, input },
              {
                onSuccess: (created) => {
                  close();
                  router.push(`/summaries/${created.id}`);
                },
              },
            )
          }
        />
      </Drawer>
    </div>
  );
}
