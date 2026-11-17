'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { describeApiError } from '@/api';
import { useMutationCreateSummary, useQuerySummaries, useQuerySummaryTargets } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { SummaryForm } from '@/components/SummaryForm';
import { SummaryList } from '@/components/SummaryList';

import { SCREEN_TEXTS } from './constants';

/**
 * История саммари и создание нового.
 *
 * Проект выбирается в форме, а не адресом экрана: вкладка сводная по всем
 * проектам, куда субъект может писать хронику (дизайн, раздел 7.2).
 */
export function SummariesScreen() {
  const router = useRouter();
  const summaries = useQuerySummaries();
  const targets = useQuerySummaryTargets();
  const [isCreating, setIsCreating] = useState(false);
  const create = useMutationCreateSummary();

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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          {SCREEN_TEXTS.create}
        </button>
      </div>

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
