import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainAddressForm } from './DomainAddressForm';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ENVIRONMENT_ID = '22222222-2222-4222-8222-222222222222';

const projects = [{ id: PROJECT_ID, name: 'Лавка' }];
const environments = [{ id: ENVIRONMENT_ID, name: 'Прод' }];

const onSubmitRoot = vi.fn();
const onSubmitSubdomain = vi.fn();
const onProjectChange = vi.fn();

function renderForm(overrides: Partial<Parameters<typeof DomainAddressForm>[0]> = {}) {
  return render(
    <DomainAddressForm
      knownRoots={[]}
      projects={projects}
      environments={environments}
      projectId={PROJECT_ID}
      onProjectChange={onProjectChange}
      onSubmitRoot={onSubmitRoot}
      onSubmitSubdomain={onSubmitSubdomain}
      {...overrides}
    />,
  );
}

describe('DomainAddressForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('называет корень введённого адреса', async () => {
    renderForm({ knownRoots: ['example.com'] });

    await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');

    expect(screen.getByText('Корень: example.com — уже в реестре')).toBeInTheDocument();
  });

  it('предупреждает, что корень будет заведён', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');

    expect(screen.getByText('Корень: example.com — будет заведён')).toBeInTheDocument();
  });

  it('пустой адрес ничего не спрашивает', () => {
    renderForm();

    expect(screen.queryByLabelText('Проект')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Владелец')).not.toBeInTheDocument();
  });

  it('спрашивает проект и окружение только для поддомена', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Адрес'), 'example.com');

    expect(screen.queryByLabelText('Проект')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Адрес'));
    await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');

    expect(screen.getByLabelText('Проект')).toBeInTheDocument();
    expect(screen.getByLabelText('Окружение')).toBeInTheDocument();
  });

  it('у корня спрашивает владельца и срок, а не проект', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Адрес'), 'example.com');

    expect(screen.getByLabelText('Владелец')).toBeInTheDocument();
    expect(screen.getByLabelText('Оплачен до')).toBeInTheDocument();
  });

  it('отправляет корень со свойствами', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Адрес'), 'example.com');
    await userEvent.type(screen.getByLabelText('Владелец'), 'ООО Ромашка');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmitRoot).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'example.com', owner: 'ООО Ромашка' }),
    );
  });

  it('отправляет корень, поправленный после первого ввода', async () => {
    // Свойства корня живут во вложенной форме: без пересборки она
    // отправила бы имя, введённое первым.
    renderForm();

    await userEvent.type(screen.getByLabelText('Адрес'), 'example.com');
    await userEvent.clear(screen.getByLabelText('Адрес'));
    await userEvent.type(screen.getByLabelText('Адрес'), 'shop.ru');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmitRoot).toHaveBeenCalledWith(expect.objectContaining({ name: 'shop.ru' }));
  });

  it('не отправляет поддомен без окружения', async () => {
    renderForm({ projectId: '', environments: [] });

    await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить адрес' }));

    expect(onSubmitSubdomain).not.toHaveBeenCalled();
  });

  it('отправляет поддомен вместе с проектом и окружением', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');
    await userEvent.selectOptions(screen.getByLabelText('Окружение'), ENVIRONMENT_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить адрес' }));

    expect(onSubmitSubdomain).toHaveBeenCalledWith({
      name: 'api.example.com',
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
    });
  });

  it('сообщает о выборе проекта наружу: окружения грузит экран', async () => {
    renderForm({ projectId: '' });

    await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');
    await userEvent.selectOptions(screen.getByLabelText('Проект'), PROJECT_ID);

    expect(onProjectChange).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('с зафиксированным корнем принимает только левую часть', async () => {
    renderForm({ knownRoots: ['example.com'], rootSuffix: 'example.com' });

    await userEvent.type(screen.getByLabelText('Адрес'), 'api');

    expect(screen.getByText('Корень: example.com — уже в реестре')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Окружение'), ENVIRONMENT_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить адрес' }));

    expect(onSubmitSubdomain).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'api.example.com' }),
    );
  });
});
