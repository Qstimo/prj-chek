'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

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
 */
export function SummariesScreen() {
  const router = useRouter();
  const summaries = useQuerySummaries();
  const targets = useQuerySummaryTargets();
  const transcriptions = useQueryTranscriptions();
  const transcriber = useQueryTranscriber();
  const [isCreating, setIsCreating] = useState(false);
  const [percent, setPercent] = useState<number>();
  const upload = useRef<AbortController | undefined>(undefined);
  const create = useMutationCreateSummary();
  const uploadRecording = useMutationUploadRecording();
  const cancel = useMutationCancelTranscription();
  const remove = useMutationDeleteTranscription();
  const retry = useMutationRetryTranscription();

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

      <Drawer
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title={SCREEN_TEXTS.create}
        width={DrawerWidth.Half}
      >
        <SummaryForm
          projects={targets.data}
          isSubmitting={create.isPending}
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
                        onSuccess: () => setIsCreating(false),
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
                  setIsCreating(false);
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
