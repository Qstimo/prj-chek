'use client';

import { AccessLevel, Section } from '@cairn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { describeApiError, summaryFailureOf } from '@/api';
import {
  SUMMARY_KEYS,
  useMutationReleaseSummary,
  useMutationSaveSummaryTasks,
  useMutationSuggestSummaryTasks,
  useMutationUpdateChronicleEntry,
  useQueryPublicLink,
  useQuerySections,
  useQuerySummary,
  useQueryTaskSuggester,
} from '@/api/hooks';
import { ChronicleForm } from '@/components/ChronicleForm';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { SummaryText } from '@/components/SummaryText';

import { SUMMARY_TEXTS, failureMessageOf } from '../constants';
import { ReleaseBlock } from './ReleaseBlock';
import { TasksBlock } from './TasksBlock';
import type { IBodyProps } from './types';

/**
 * Три блока по шагам потока: текст, задачи, релиз (дизайн, раздел 7.3).
 *
 * Текст правится **существующей** ручкой записи хроники: вторая дверь к
 * нему разошлась бы с первой. После правки перечитывается и саммари —
 * `isTextStale` и сам текст считаются из той же записи.
 */
export function SummaryBody({ projectId, summaryId }: IBodyProps) {
  const client = useQueryClient();
  const router = useRouter();
  const detail = useQuerySummary(projectId, summaryId);
  const sections = useQuerySections(projectId);
  const suggester = useQueryTaskSuggester();
  const publicLink = useQueryPublicLink(projectId);
  const suggest = useMutationSuggestSummaryTasks(projectId, summaryId);
  const save = useMutationSaveSummaryTasks(projectId, summaryId);
  const release = useMutationReleaseSummary(projectId, summaryId);
  const updateEntry = useMutationUpdateChronicleEntry(projectId);
  const [isEditing, setIsEditing] = useState(false);

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

  return (
    <div className="space-y-8">
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
        isSaving={save.isPending}
        saveError={describeApiError(save.error)}
      />

      <ReleaseBlock
        summary={summary}
        canRelease={sections.data[Section.Roadmap] === AccessLevel.Write}
        isRoadmapPublic={publicLink.data !== null && publicLink.data !== undefined}
        isReleasing={release.isPending}
        releaseError={failureMessageOf(
          summaryFailureOf(release.error).code,
          undefined,
          describeApiError(release.error),
        )}
        onRelease={(input) =>
          release.mutate(input, {
            onSuccess: (result) =>
              router.push(`/projects/${projectId}/roadmap?version=${result.versionId}`),
          })
        }
      />

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
