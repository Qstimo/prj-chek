import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryReleaseForm } from './SummaryReleaseForm';

describe('форма релиза из саммари', () => {
  it('обозначение предзаполнено подсказкой', () => {
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('v1.3');
  });

  it('без подсказки поле пусто и отправка выключена', () => {
    // Подсказки нет, когда версий нет, в обозначениях нет цифр или у
    // субъекта нет выдачи на роадмап.
    render(<SummaryReleaseForm suggestedLabel={null} taskCount={3} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Сформировать/ })).toBeDisabled();
  });

  it('введённое обозначение разблокирует отправку', async () => {
    render(<SummaryReleaseForm suggestedLabel={null} taskCount={3} onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/Обозначение/), 'Осень');

    expect(screen.getByRole('button', { name: /Сформировать/ })).toBeEnabled();
  });

  it('поля «Дата релиза» нет', () => {
    // Версия из созвона — работа впереди. А главное: чтобы узнать, есть
    // ли у проекта платформы, нужен уровень на «Инфо», которого у
    // субъекта этого потока может не быть вовсе.
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText(/Дата релиза/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Плановая дата/)).toBeInTheDocument();
  });

  it('поля «Дата релиза» нет и при выпущенном состоянии', async () => {
    // «Ни при каких условиях» значит и это: `VersionFields` на `released`
    // показывает дату, а здесь её не бывает (дизайн, раздел 7.5).
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} />);

    await userEvent.selectOptions(
      screen.getByLabelText(/Состояние/),
      RoadmapVersionState.Released,
    );

    // Состояние действительно переключилось: без этой проверки
    // пропущенный `await` оставлял бы `planned` и повторял соседний тест.
    expect(screen.getByLabelText(/Состояние/)).toHaveValue(RoadmapVersionState.Released);
    expect(screen.queryByLabelText(/Дата релиза/)).not.toBeInTheDocument();
  });

  // Проверка «платформы проекта форма не запрашивает» переехала на экран
  // (`SummaryScreen.test.tsx`): здесь она смотрела на подменённый `fetch`
  // у презентационного компонента, который в сеть не ходит ни при каких
  // условиях — данные в этом проекте идут через `apiClient` и
  // react-query, то есть assert был верен при любой реализации. А живой
  // запрос платформ ушёл бы из экрана, и сторожить его надо там.

  it('отправляет новую версию с обозначением, состоянием и плановой датой', async () => {
    const onSubmit = vi.fn();
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать/ }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'new',
      version: {
        label: 'v1.3',
        state: RoadmapVersionState.Planned,
        plannedDate: expect.any(String),
      },
    });
  });

  it('`releasedDate` не уходит даже как null', async () => {
    const onSubmit = vi.fn();
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать/ }));

    expect(onSubmit.mock.calls[0]?.[0]?.version).not.toHaveProperty('releasedDate');
  });

  it('говорит, сколько незакрытых чекпоинтов будет создано', () => {
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} />);

    expect(screen.getByText(/3 незакрытыми чекпоинтами/)).toBeInTheDocument();
  });

  it('при опубликованном роадмапе предупреждает о публичной выдаче', () => {
    render(
      <SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} isRoadmapPublic />,
    );

    expect(screen.getByText(/публичную выдачу/)).toBeInTheDocument();
  });

  it('без публичной ссылки о публичной выдаче не говорит', () => {
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} />);

    expect(screen.queryByText(/публичную выдачу/)).not.toBeInTheDocument();
  });
});

describe('цель релиза', () => {
  const VERSIONS = [
    { id: '11111111-1111-1111-1111-111111111111', label: 'v1.1' },
    { id: '22222222-2222-2222-2222-222222222222', label: 'v1.2' },
  ];

  /** Переключить цель на существующую версию. */
  async function chooseExisting(): Promise<void> {
    await userEvent.selectOptions(screen.getByLabelText('Цель релиза'), 'existing');
  }

  it('по умолчанию цель — новая версия с подставленным обозначением', () => {
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Цель релиза')).toHaveValue('new');
    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('v1.3');
  });

  it('без версий выбора цели нет вовсе', () => {
    // Выбирать было бы нечего: «потом прикрепить к релизу» начинается с
    // существующей версии, а её ещё нет.
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText('Цель релиза')).not.toBeInTheDocument();
  });

  it('у существующей версии полей новой версии нет', async () => {
    // Они относятся к созданию версии: оставить их значило бы спросить
    // обозначение у версии, у которой оно уже есть.
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={vi.fn()}
      />,
    );

    await chooseExisting();

    expect(screen.queryByLabelText(/Обозначение/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Плановая дата/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Состояние/)).not.toBeInTheDocument();
  });

  it('поля «Дата релиза» нет и у существующей версии', async () => {
    // «Ни при каких условиях» значит и это (дизайн, 4.5).
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={vi.fn()}
      />,
    );

    await chooseExisting();

    expect(screen.queryByLabelText(/Дата релиза/)).not.toBeInTheDocument();
  });

  it('существующая версия уезжает идентификатором и без полей версии', async () => {
    const onSubmit = vi.fn();
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={onSubmit}
      />,
    );

    await chooseExisting();
    await userEvent.selectOptions(screen.getByLabelText('Версия'), VERSIONS[1]!.id);
    await userEvent.click(screen.getByRole('button', { name: /Сформировать/ }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: 'existing', versionId: VERSIONS[1]!.id });
  });

  it('у существующей цели названы и число задач, и обозначение версии', async () => {
    // «Версия будет создана» здесь соврало бы: она уже есть, и задачи к
    // ней добавляются.
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={vi.fn()}
      />,
    );

    await chooseExisting();

    expect(screen.getByText(/В версию v1\.1 добавятся 3 незакрытых чекпоинта/)).toBeInTheDocument();
    expect(screen.queryByText(/будет создана/)).not.toBeInTheDocument();
  });

  it('обозначение в подписи следует за выбором версии', async () => {
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={vi.fn()}
      />,
    );

    await chooseExisting();
    await userEvent.selectOptions(screen.getByLabelText('Версия'), VERSIONS[1]!.id);

    expect(screen.getByText(/В версию v1\.2 добавятся/)).toBeInTheDocument();
  });

  it('возврат к новой версии возвращает её поля', async () => {
    // Диалог не должен стать тупиком: переключение в обе стороны.
    render(
      <SummaryReleaseForm
        suggestedLabel="v1.3"
        taskCount={3}
        versions={VERSIONS}
        onSubmit={vi.fn()}
      />,
    );

    await chooseExisting();
    await userEvent.selectOptions(screen.getByLabelText('Цель релиза'), 'new');

    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('v1.3');
  });
});
