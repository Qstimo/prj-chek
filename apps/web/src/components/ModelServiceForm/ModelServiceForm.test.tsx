import {
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  type ModelServiceSettings,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelServiceForm } from './ModelServiceForm';

/** Настроенный узел: поля формы заполнены его значениями. */
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

/** Ненастроенный узел: пустые поля, источник «ниоткуда». */
const empty: ModelServiceSettings = {
  ...fromDatabase,
  source: ModelServiceSource.None,
  baseUrl: '',
  host: null,
  model: '',
  hasSecret: false,
  isOperational: false,
  blockedBy: 'secret_missing',
  updatedAt: null,
  updatedByLabel: null,
};

const onSave = vi.fn();

describe('ModelServiceForm', () => {
  beforeEach(() => {
    onSave.mockReset();
  });

  it('пресет заполняет адрес и схему, но не имя модели', async () => {
    // Перечень моделей у провайдера меняется быстрее, чем выходит наш
    // код, и подставленное `gpt-4o-mini` в узле Yandex выглядело бы
    // настроенным и отвечало бы 400 (дизайн, 10.3).
    render(<ModelServiceForm settings={empty} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'yandex');

    expect(screen.getByLabelText('Адрес')).toHaveValue('https://llm.api.cloud.yandex.net/v1');
    expect(screen.getByLabelText('Схема авторизации')).toHaveValue(ModelAuthScheme.ApiKey);
    expect(screen.getByLabelText('Модель')).toHaveValue('');
  });

  it('пресет Yandex назван требующим проверки, а не фактом', async () => {
    // Заготовка, которая врёт о чужом API, хуже пустого поля: адрес
    // Yandex подтверждён только третьими источниками (дизайн, таблица
    // проверок, пункт 1).
    render(<ModelServiceForm settings={empty} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'yandex');

    expect(screen.getByText(/требует проверки/i)).toBeInTheDocument();
  });

  it('пресет «свой узел» адреса не подставляет', async () => {
    // Подставить внешний адрес локальной установке значило бы тихо
    // отправить текст наружу (дизайн, 10.3).
    render(<ModelServiceForm settings={empty} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'custom');

    expect(screen.getByLabelText('Адрес')).toHaveValue('');
    expect(screen.getByLabelText('Схема авторизации')).toHaveValue(ModelAuthScheme.None);
  });

  it('пресет при заполненных полях спрашивает подтверждение', async () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'openai');

    expect(screen.getByRole('dialog')).toHaveTextContent(/Адрес и схема будут заменены/);
    expect(screen.getByLabelText('Адрес')).toHaveValue('https://api.proxyapi.ru/v1');
  });

  it('подтверждённый пресет заменяет адрес и схему', async () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'openai');
    await userEvent.click(screen.getByRole('button', { name: 'Да, заменить' }));

    expect(screen.getByLabelText('Адрес')).toHaveValue('https://api.openai.com/v1');
  });

  it('поле ключа пустое при открытии и только на запись', () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    const secret = screen.getByLabelText('Ключ');

    // Заполнять его текущим значением нечем: сервер его не отдаёт.
    expect(secret).toHaveValue('');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveAttribute('autocomplete', 'new-password');
  });

  it('сохранение без правки ключа поля ключа не отправляет', async () => {
    // Отсутствие поля означает «не менять»; пустая строка схемой
    // отвергается, чтобы открыть форму и сохранить не значило стереть
    // ключ (дизайн, 4.2).
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText('Модель'));
    await userEvent.type(screen.getByLabelText('Модель'), 'другая');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(expect.not.objectContaining({ secret: expect.anything() }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ model: 'другая' }));
  });

  it('вписанный ключ уходит значением', async () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Ключ'), 'новый-ключ');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ secret: 'новый-ключ' }));
  });

  it('«Убрать ключ» отправляет null', async () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать ключ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ secret: null }));
  });

  it('отказывает по негодному адресу до отправки', async () => {
    // Той же функцией контракта, что на сервере, и теми же словами.
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText('Адрес'));
    await userEvent.type(screen.getByLabelText('Адрес'), 'http://api.example/v1');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/открытому каналу/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('у узла в контуре http проходит и предупреждает', async () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Вид'), ModelServicePlacement.Local);
    await userEvent.clear(screen.getByLabelText('Адрес'));
    await userEvent.type(screen.getByLabelText('Адрес'), 'http://llm.internal:8000/v1');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://llm.internal:8000/v1' }),
    );
  });

  it('ключ в строке запроса отвергается своими словами', async () => {
    render(<ModelServiceForm settings={fromDatabase} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText('Адрес'));
    await userEvent.type(screen.getByLabelText('Адрес'), 'https://api.example/v1?key=sk-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/строки запроса/);
    expect(onSave).not.toHaveBeenCalled();
  });
});
