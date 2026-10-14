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

/**
 * Действия фабрикой, а не общей константой: `clearMocks` в конфиге веба
 * не включён, и вызовы протекали бы между тестами.
 */
function makeActions(overrides: Partial<IVersionActions> = {}): IVersionActions {
  return {
    onToggleCheckpoint: vi.fn(),
    onAddCheckpoint: vi.fn(),
    onDeleteCheckpoint: vi.fn(),
    onSaveVersion: vi.fn(),
    onDeleteVersion: vi.fn(),
    isSavingVersion: false,
    isSubmittingCheckpoint: false,
    ...overrides,
  };
}

/** Кнопка сохранения черновика — она же признак «есть что сохранять». */
function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Сохранить' });
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

  it('без actions ни кнопки сохранения, ни полей, ни удаления', () => {
    render(<VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Обозначение')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить версию' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Доставка')).toBeDisabled();
  });

  it('версия-метаданные — без блока чекпоинтов', () => {
    const { checkpoints: _checkpoints, ...metadata } = detail;
    render(<VersionDrawer version={metadata} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Оплата')).not.toBeInTheDocument();
  });

  it('поля версии правятся на месте, без перехода в режим правки', async () => {
    // Кнопки «Редактировать» больше нет: паспорт то поля, то текст — это
    // и была третья манера поведения в одной панели.
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Обозначение')).toHaveValue('v1.0');
  });

  it('кнопка сохранения неактивна, пока ничего не меняли', () => {
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('правка поля версии будит кнопку и показывает предупреждение', async () => {
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    await userEvent.type(screen.getByLabelText('Обозначение'), '1');

    expect(saveButton()).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Есть несохранённые изменения');
  });

  it('пустое обозначение сохранять нечем', async () => {
    // Схема требует непустое имя: без этой проверки кнопка звала бы
    // сервер за отказом 400.
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    await userEvent.clear(screen.getByLabelText('Обозначение'));

    expect(saveButton()).toBeDisabled();
  });

  it('сохранение отдаёт патч только изменённых полей', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={actions}
      />,
    );

    await userEvent.type(screen.getByLabelText('Обозначение'), '1');
    await userEvent.click(saveButton());

    expect(actions.onSaveVersion).toHaveBeenCalledWith({ label: 'v1.01' }, []);
  });

  it('перечитанные данные гасят кнопку сами', async () => {
    // Колбэка успеха нет намеренно: обнуление черновика вручную на миг
    // вернуло бы поля к старому значению, а потом пришёл бы ответ сервера.
    const { rerender } = render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    await userEvent.type(screen.getByLabelText('Обозначение'), '1');
    await userEvent.click(saveButton());

    rerender(
      <VersionDrawer
        version={{ ...detail, label: 'v1.01' }}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('пока сохраняет, кнопка занята', async () => {
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions({ isSavingVersion: true })}
      />,
    );

    await userEvent.type(screen.getByLabelText('Обозначение'), '1');

    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled();
  });

  it('ошибка сохранения видна, панель не закрывается', () => {
    const onClose = vi.fn();
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={onClose}
        actions={makeActions({ saveError: 'Версия с таким обозначением уже есть' })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Версия с таким обозначением уже есть');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('галочка чекпоинта по-прежнему меняется сразу', async () => {
    // Чекпоинт — отдельная сущность со своим адресом, и в черновик он
    // не уходит. Блок подписан так, чтобы разница была видна.
    const actions = makeActions();
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={actions}
      />,
    );

    await userEvent.click(screen.getByLabelText('Доставка'));

    expect(actions.onToggleCheckpoint).toHaveBeenCalledWith('c2', true);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Чекпоинты')).toBeInTheDocument();
    expect(screen.getByText(/меняются сразу/i)).toBeInTheDocument();
  });

  it('удаление версии — в два шага', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={actions}
      />,
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

  describe('закрытие', () => {
    it('чистый черновик закрывается сразу', async () => {
      const onClose = vi.fn();
      render(
        <VersionDrawer
          version={detail}
          isCurrent={false}
          isOpen
          onClose={onClose}
          actions={makeActions()}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

      expect(onClose).toHaveBeenCalled();
    });

    it('грязный черновик спрашивает подтверждение', async () => {
      const onClose = vi.fn();
      render(
        <VersionDrawer
          version={detail}
          isCurrent={false}
          isOpen
          onClose={onClose}
          actions={makeActions()}
        />,
      );

      await userEvent.type(screen.getByLabelText('Обозначение'), '1');
      await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByRole('dialog', { name: 'Подтверждение закрытия' }),
      ).toBeInTheDocument();
    });

    it('«Отмена» оставляет панель с черновиком', async () => {
      const onClose = vi.fn();
      render(
        <VersionDrawer
          version={detail}
          isCurrent={false}
          isOpen
          onClose={onClose}
          actions={makeActions()}
        />,
      );

      await userEvent.type(screen.getByLabelText('Обозначение'), '1');
      await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
      await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Обозначение')).toHaveValue('v1.01');
    });

    it('подтверждение закрывает панель', async () => {
      const onClose = vi.fn();
      render(
        <VersionDrawer
          version={detail}
          isCurrent={false}
          isOpen
          onClose={onClose}
          actions={makeActions()}
        />,
      );

      await userEvent.type(screen.getByLabelText('Обозначение'), '1');
      await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
      await userEvent.click(screen.getByRole('button', { name: 'Закрыть без сохранения' }));

      expect(onClose).toHaveBeenCalled();
    });

    it('Esc при грязном черновике тоже спрашивает', async () => {
      // Все три пути закрытия — Esc, подложка и крестик — идут через один
      // `onClose` Radix, и перехват у них общий.
      const onClose = vi.fn();
      render(
        <VersionDrawer
          version={detail}
          isCurrent={false}
          isOpen
          onClose={onClose}
          actions={makeActions()}
        />,
      );

      await userEvent.type(screen.getByLabelText('Обозначение'), '1');
      await userEvent.keyboard('{Escape}');

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Подтверждение закрытия' })).toBeInTheDocument();
    });
  });

  describe('выпуски платформ', () => {
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

      // Прочерк — это отсутствие собственного состояния: платформа идёт
      // вместе с версией, и своей строки выпуска у неё нет.
      expect(optionsOf(screen.getByLabelText('Состояние API'))).toEqual([
        '—',
        'на тесте',
        'в релизе',
      ]);
      expect(optionsOf(screen.getByLabelText('Состояние App Store'))).toContain('на модерации');
    });

    it('выбор «в релизе» подставляет сегодняшнюю дату в поле', async () => {
      // Иначе сводка покажет релиз без числа, а фактическая дата версии
      // молча уедет на хранимую колонку.
      render(
        <VersionDrawer
          version={detail}
          platforms={[API]}
          isCurrent={false}
          isOpen
          onClose={vi.fn()}
          actions={makeActions()}
        />,
      );

      await userEvent.selectOptions(
        screen.getByLabelText('Состояние API'),
        PlatformReleaseState.Released,
      );

      expect(screen.getByLabelText('Дата API')).toHaveValue(
        new Intl.DateTimeFormat('sv-SE').format(new Date()),
      );
    });

    it('дату выпуска можно поставить задним числом', async () => {
      // Главная починка этой работы: раньше дата была равна дню, когда
      // переключили селект, и исправить её было нечем.
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

      const date = screen.getByLabelText('Дата App Store');
      await userEvent.clear(date);
      await userEvent.type(date, '2026-03-02');
      await userEvent.click(saveButton());

      expect(actions.onSaveVersion).toHaveBeenCalledWith(
        {},
        [
          {
            platformId: STORE.id,
            kind: 'set',
            input: {
              state: PlatformReleaseState.Released,
              releasedDate: '2026-03-02',
              buildLabel: '1.2 (45)',
            },
          },
        ],
      );
    });

    it('обозначение сборки правится', async () => {
      const actions = makeActions();
      render(
        <VersionDrawer
          version={detail}
          platforms={[STORE]}
          isCurrent={false}
          isOpen
          onClose={vi.fn()}
          actions={actions}
        />,
      );

      await userEvent.selectOptions(
        screen.getByLabelText('Состояние App Store'),
        PlatformReleaseState.OnTest,
      );
      await userEvent.type(screen.getByLabelText('Сборка App Store'), '1.3 (7)');
      await userEvent.click(saveButton());

      expect(actions.onSaveVersion).toHaveBeenCalledWith(
        {},
        [
          {
            platformId: STORE.id,
            kind: 'set',
            input: {
              state: PlatformReleaseState.OnTest,
              releasedDate: null,
              buildLabel: '1.3 (7)',
            },
          },
        ],
      );
    });

    it('прочерк убирает дату и сборку и даёт снятие', async () => {
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

      expect(screen.queryByLabelText('Дата App Store')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Сборка App Store')).not.toBeInTheDocument();

      await userEvent.click(saveButton());

      expect(actions.onSaveVersion).toHaveBeenCalledWith(
        {},
        [{ platformId: STORE.id, kind: 'clear' }],
      );
    });

    it('дата видна только у «в релизе»', async () => {
      // У отправленного на модерацию даты выхода ещё нет, и поле для неё
      // обещало бы знание, которого нет.
      render(
        <VersionDrawer
          version={detail}
          platforms={[STORE]}
          isCurrent={false}
          isOpen
          onClose={vi.fn()}
          actions={makeActions()}
        />,
      );

      await userEvent.selectOptions(
        screen.getByLabelText('Состояние App Store'),
        PlatformReleaseState.InReview,
      );

      expect(screen.queryByLabelText('Дата App Store')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Сборка App Store')).toBeInTheDocument();
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
      expect(screen.getByText('1.2 (45)')).toBeInTheDocument();
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
});
