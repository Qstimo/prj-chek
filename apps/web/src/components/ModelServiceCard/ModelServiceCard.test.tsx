import {
  MODEL_SERVICE_DISABLED,
  MODEL_SERVICE_SECRET_MISSING,
  MODEL_SERVICE_SECRET_UNDECRYPTABLE,
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  type ModelServiceSettings,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ModelServiceCard } from './ModelServiceCard';

/** Настроенный с экрана узел: проверки меняют в нём одно поле. */
const fromDatabase: ModelServiceSettings = {
  kind: ModelServiceKind.TaskSuggester,
  source: ModelServiceSource.Database,
  baseUrl: 'https://api.proxyapi.ru/v1',
  host: 'api.proxyapi.ru',
  authScheme: ModelAuthScheme.Bearer,
  model: 'qwen/qwen3-max',
  folder: null,
  placement: ModelServicePlacement.External,
  timeoutSeconds: 60,
  hasSecret: true,
  isEnabled: true,
  isOperational: true,
  blockedBy: null,
  updatedAt: '2026-11-17T10:00:00.000Z',
  updatedByLabel: 'админ@cairn.local',
};

/** Тот же узел, настроенный окружением. */
const fromEnvironment: ModelServiceSettings = {
  ...fromDatabase,
  source: ModelServiceSource.Environment,
  updatedAt: null,
  updatedByLabel: null,
};

/** Общие обработчики: карточка их только зовёт. */
const handlers = { onEdit: vi.fn(), onProbe: vi.fn(), onClear: vi.fn() };

describe('ModelServiceCard', () => {
  it('первым делом называет источник настройки', () => {
    // Это первый вопрос, который задают (дизайн, 12.2).
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(screen.getByText('Задано в интерфейсе')).toBeInTheDocument();
  });

  it('называет источник «окружение» и «не настроено» своими словами', () => {
    render(<ModelServiceCard settings={fromEnvironment} {...handlers} />);
    expect(screen.getByText('Из окружения')).toBeInTheDocument();

    render(
      <ModelServiceCard
        settings={{ ...fromEnvironment, source: ModelServiceSource.None }}
        {...handlers}
      />,
    );
    expect(screen.getByText('Не настроено')).toBeInTheDocument();
  });

  it('об именах переменных окружения не говорит вовсе — отвечает бирка источника', () => {
    // Полоса из семи имён отвечала повторно на тот же вопрос и занимала
    // больше места, чем весь паспорт узла (дизайн 2026-11-19, 2.1).
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(screen.getByText('Задано в интерфейсе')).toBeInTheDocument();
    expect(screen.queryByText(/не действуют/)).toBeNull();
    expect(screen.queryByText(/CAIRN_TASK_SUGGESTER/)).toBeNull();
  });

  it('различает «выключено вами» и «нет ключа»', () => {
    // Чинятся разным действием, и одно поле отправило бы человека искать
    // не то (дизайн, 4.1).
    render(
      <ModelServiceCard
        settings={{
          ...fromDatabase,
          isEnabled: false,
          isOperational: false,
          blockedBy: MODEL_SERVICE_DISABLED,
        }}
        {...handlers}
      />,
    );
    expect(screen.getByText('Выключено')).toBeInTheDocument();

    render(
      <ModelServiceCard
        settings={{
          ...fromDatabase,
          hasSecret: false,
          isOperational: false,
          blockedBy: MODEL_SERVICE_SECRET_MISSING,
        }}
        {...handlers}
      />,
    );
    expect(screen.getByText('Нет ключа')).toBeInTheDocument();
  });

  it('о нерасшифровываемом ключе говорит, что проверить', () => {
    render(
      <ModelServiceCard
        settings={{
          ...fromDatabase,
          isOperational: false,
          blockedBy: MODEL_SERVICE_SECRET_UNDECRYPTABLE,
        }}
        {...handlers}
      />,
    );

    expect(screen.getByText(/CAIRN_ENCRYPTION_KEY/)).toBeInTheDocument();
  });

  it('о ключе сообщает «задан», и больше ничего', () => {
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(screen.getByText('Ключ задан')).toBeInTheDocument();
  });

  it('о ключе не сообщает ни длины, ни хвоста — состав строк о ключе один', () => {
    // Хвост ключа сужает перебор и не отвечает ни на один вопрос, на
    // который не отвечает «задан» (дизайн, 3.4).
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(screen.getAllByText(/[Кк]люч/).map((node) => node.textContent)).toEqual([
      'Ключ задан',
    ]);
  });

  it('называет узел, модель и схему авторизации по-русски', () => {
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(screen.getByText('api.proxyapi.ru')).toBeInTheDocument();
    expect(screen.getByText('qwen/qwen3-max')).toBeInTheDocument();
    expect(screen.getByText('Bearer')).toBeInTheDocument();
    expect(screen.getByText('Внешний узел')).toBeInTheDocument();
  });

  it('называет, кто и когда правил, когда источник — база', () => {
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(screen.getByText(/админ@cairn.local/)).toBeInTheDocument();
  });

  it('кнопки сброса нет, когда источник — окружение', () => {
    // Сбрасывать нечего: строки в базе нет.
    render(<ModelServiceCard settings={fromEnvironment} {...handlers} />);

    expect(screen.queryByRole('button', { name: /Вернуть настройку окружения/ })).toBeNull();
  });

  it('кнопка сброса есть, когда источник — база', () => {
    render(<ModelServiceCard settings={fromDatabase} {...handlers} />);

    expect(
      screen.getByRole('button', { name: /Вернуть настройку окружения/ }),
    ).toBeInTheDocument();
  });

  it('проверка связи выключена у ненастроенного узла', () => {
    // Проверять нечего, и ручка ответила бы отказом.
    render(
      <ModelServiceCard
        settings={{ ...fromDatabase, isOperational: false, blockedBy: MODEL_SERVICE_SECRET_MISSING }}
        {...handlers}
      />,
    );

    expect(screen.getByRole('button', { name: 'Проверить связь' })).toBeDisabled();
  });
});
