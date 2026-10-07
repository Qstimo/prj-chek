import {
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  type Platform,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionDrawer } from './VersionDrawer';
import type { IVersionActions } from './types';

const detail = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.InProgress,
  plannedDate: '2026-12-01',
  releasedDate: null,
  position: 1,
  progress: { done: 1, total: 2 },
  releases: [],
  checkpoints: [
    { id: 'c1', title: 'Оплата', isDone: true, position: 1, platformIds: [] },
    { id: 'c2', title: 'Доставка', isDone: false, position: 2, platformIds: [] },
  ],
};

const API: Platform = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE: Platform = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

/** Версия с выпуском магазина: «в релизе 1.2 (45)» от 14.03.2026. */
const withRelease = {
  ...detail,
  releases: [
    {
      platformId: STORE.id,
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-14',
      buildLabel: '1.2 (45)',
    },
  ],
};

/** Версия уровня метаданных: ни чекпоинтов, ни выпусков. */
const metadataOnly = {
  id: detail.id,
  label: detail.label,
  state: detail.state,
  plannedDate: detail.plannedDate,
  releasedDate: detail.releasedDate,
  position: detail.position,
  progress: detail.progress,
};

/** Подписи опций селекта — по ним проверяется состав выбора. */
function optionsOf(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((option) => option.textContent ?? '');
}

function makeActions(overrides: Partial<IVersionActions> = {}): IVersionActions {
  return {
    onToggleCheckpoint: vi.fn(),
    onAddCheckpoint: vi.fn(),
    onDeleteCheckpoint: vi.fn(),
    onSubmitVersion: vi.fn(),
    onDeleteVersion: vi.fn(),
    onSetRelease: vi.fn(),
    onClearRelease: vi.fn(),
    isSubmittingVersion: false,
    isSubmittingCheckpoint: false,
    ...overrides,
  };
}

describe('VersionDrawer', () => {
  it('просмотр: паспорт, прогресс и чекпоинты', () => {
    render(<VersionDrawer version={detail} isCurrent isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.getByText('01.12.2026')).toBeInTheDocument();
    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeChecked();
  });

  it('без actions органов управления нет', () => {
    render(<VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить версию' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Доставка')).toBeDisabled();
  });

  it('версия-метаданные — без блока чекпоинтов', () => {
    const { checkpoints: _checkpoints, ...metadata } = detail;
    render(<VersionDrawer version={metadata} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Оплата')).not.toBeInTheDocument();
  });

  it('галочка чекпоинта зовёт onToggleCheckpoint', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByLabelText('Доставка'));

    expect(actions.onToggleCheckpoint).toHaveBeenCalledWith('c2', true);
  });

  it('редактирование открывается и отменяется', async () => {
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    expect(screen.getByLabelText('Обозначение')).toHaveValue('v1.0');

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByLabelText('Обозначение')).not.toBeInTheDocument();
  });

  it('сохранение передаёт форму и колбэк возврата в просмотр', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(actions.onSubmitVersion).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'v1.0' }),
      expect.any(Function),
    );
  });

  it('удаление версии — в два шага', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Удалить версию' }));
    expect(actions.onDeleteVersion).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(actions.onDeleteVersion).toHaveBeenCalled();
  });

  it('отдаёт чтение заголовка форме чекпоинта', async () => {
    const onReadCheckpointTitle = vi.fn(async () => 'Перевести биллинг');
    render(
      <VersionDrawer
        version={detail}
        isCurrent
        isOpen
        onClose={vi.fn()}
        actions={makeActions({ onReadCheckpointTitle })}
      />,
    );

    await userEvent.type(
      screen.getByLabelText('Ссылка на задачу'),
      'https://tracker.example.com/TASK-17',
    );
    await userEvent.tab();

    expect(onReadCheckpointTitle).toHaveBeenCalledWith('https://tracker.example.com/TASK-17');
  });

  it('предлагает модерацию только магазину', () => {
    render(
      <VersionDrawer
        version={detail}
        platforms={[API, STORE]}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    expect(optionsOf(screen.getByLabelText('Состояние API'))).toEqual([
      'как у версии',
      'на тесте',
      'в релизе',
    ]);
    expect(optionsOf(screen.getByLabelText('Состояние App Store'))).toContain('на модерации');
  });

  it('отправляет всю тройку, а не одно изменённое поле', async () => {
    // `PUT` заменяет клетку целиком: посылка одного состояния обнулила бы
    // уже введённое обозначение сборки и дату.
    const actions = makeActions();

    render(
      <VersionDrawer
        version={withRelease}
        platforms={[STORE]}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={actions}
      />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText('Состояние App Store'),
      PlatformReleaseState.InReview,
    );

    expect(actions.onSetRelease).toHaveBeenCalledWith('p2', {
      state: PlatformReleaseState.InReview,
      releasedDate: '2026-03-14',
      buildLabel: '1.2 (45)',
    });
  });

  it('выбор «в релизе» подставляет сегодняшнюю дату', async () => {
    // Иначе сводка покажет релиз без числа, а фактическая дата версии
    // молча уедет на хранимую колонку.
    const actions = makeActions();

    render(
      <VersionDrawer
        version={detail}
        platforms={[API]}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={actions}
      />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText('Состояние API'),
      PlatformReleaseState.Released,
    );

    expect(actions.onSetRelease).toHaveBeenCalledWith('p1', {
      state: PlatformReleaseState.Released,
      releasedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      buildLabel: null,
    });
  });

  it('«как у версии» снимает выпуск', async () => {
    const actions = makeActions();

    render(
      <VersionDrawer
        version={withRelease}
        platforms={[STORE]}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={actions}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Состояние App Store'), '');

    expect(actions.onClearRelease).toHaveBeenCalledWith('p2');
  });

  it('без действий показывает выпуски без органов управления', () => {
    render(
      <VersionDrawer
        version={withRelease}
        platforms={[STORE]}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/в релизе/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Состояние App Store')).not.toBeInTheDocument();
  });

  it('на уровне метаданных блока платформ нет', () => {
    // `releases` приходят только с уровнем чтения: иначе блок оказался бы
    // пустым и соврал бы, что выпусков нет.
    render(
      <VersionDrawer
        version={metadataOnly}
        platforms={[STORE]}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('Платформы')).not.toBeInTheDocument();
  });
});
