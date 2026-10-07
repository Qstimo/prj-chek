import { ProjectLifecycle } from '@cairn/shared';
import type { ProjectFormValues } from '@/components/ProjectForm';

/** Пустой паспорт: значения формы создания проекта. */
export const EMPTY_PROJECT: ProjectFormValues = {
  name: '',
  purpose: null,
  stack: null,
  repoUrl: null,
  notes: null,
  lifecycle: ProjectLifecycle.Development,
};
