import { AccessLevel, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { VariablesScreen } from './VariablesScreen';

vi.mock('@/api/hooks');

const VAR_A = {
  id: '11111111-1111-1111-1111-111111111111',
  key: 'API_KEY',
  description: 'ключ платёжного шлюза',
  currentVersion: 1,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
};

const VAR_B = {
  id: '22222222-2222-2222-2222-222222222222',
  key: 'DB_URL',
  description: 'строка подключения',
  currentVersion: 1,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null, data: undefined } as never;
}

beforeEach(() => {
  vi.mocked(hooks.useQueryVariables).mockReturnValue(query([VAR_A, VAR_B]));
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Variables]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useMutationCreateVariable).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateVariable).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteVariable).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationRevealVariable).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationRevealVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationRollbackVariable).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationImportEnv).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationExportEnv).mockReturnValue(mutation());
});

describe('VariablesScreen', () => {
  it('открывает правку переменной с её значениями', async () => {
    render(<VariablesScreen projectId="p1" environmentId="e1" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[0]!);

    expect(screen.getByLabelText('Ключ')).toHaveValue('API_KEY');
  });

  it('пересобирает форму при переходе к правке другой переменной', async () => {
    render(<VariablesScreen projectId="p1" environmentId="e1" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[1]!);

    // Без перемонтирования форма держала бы ключ первой переменной, и
    // «Сохранить» переименовало бы вторую в чужой ключ.
    expect(screen.getByLabelText('Ключ')).toHaveValue('DB_URL');
  });

  it('не оставляет набранный секрет в форме при переходе от создания к правке', async () => {
    render(<VariablesScreen projectId="p1" environmentId="e1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить переменную' }));
    await userEvent.type(screen.getByLabelText('Ключ'), 'NEW_TOKEN');
    await userEvent.type(screen.getByLabelText('Значение'), 'секрет-для-новой');

    await userEvent.click(screen.getAllByRole('button', { name: 'Править' })[1]!);

    expect(screen.getByLabelText('Ключ')).toHaveValue('DB_URL');
    expect(screen.getByLabelText('Значение')).toHaveValue('');
  });
});
