'use client';

import type {
  EnvironmentCreate,
  EnvironmentDetail,
  EnvironmentMetadata,
  Platform,
} from '@cairn/shared';

import { describeApiError } from '@/api';
import { useMutationCreateEnvironment, useMutationUpdateEnvironment } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { EnvironmentForm, type ServerOption } from '@/components/EnvironmentForm';

import { formValuesOf } from './utils';

/** Пропсы панели окружения. */
interface IProps {
  projectId: string;
  /** Правимое окружение; `null` — панель создания. */
  environment: EnvironmentMetadata | EnvironmentDetail | null;
  isOpen: boolean;
  onClose: () => void;
  servers: ServerOption[];
  canAssignServer: boolean;
  knownDomains?: string[];
  platforms?: Platform[];
}

/**
 * Форма окружения в выезжающей панели.
 *
 * Одна панель на создание и правку: поля, подсказки и права у них те же,
 * различаются только заголовок и мутация. Две почти одинаковых панели
 * разошлись бы при первой же правке формы.
 */
export function EnvironmentPanel({ projectId, environment, isOpen, onClose, ...form }: IProps) {
  const create = useMutationCreateEnvironment(projectId);
  const update = useMutationUpdateEnvironment(projectId);

  const mutation = environment ? update : create;

  function submit(input: EnvironmentCreate): void {
    if (environment) {
      update.mutate({ id: environment.id, input }, { onSuccess: onClose });

      return;
    }

    create.mutate(input, { onSuccess: onClose });
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={environment ? 'Правка окружения' : 'Новое окружение'}
      width={DrawerWidth.Half}
    >
      <EnvironmentForm
        // Ключ перемонтирует форму при смене правимого окружения: она
        // держит значения в состоянии и с пропом не ресинхронизируется.
        key={environment?.id ?? 'new'}
        initial={formValuesOf(environment ?? undefined)}
        isSubmitting={mutation.isPending}
        error={describeApiError(mutation.error)}
        onSubmit={submit}
        {...form}
      />
    </Drawer>
  );
}
