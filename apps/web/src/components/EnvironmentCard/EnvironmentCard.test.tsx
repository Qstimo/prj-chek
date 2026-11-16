import { EnvironmentKind, PlatformKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentCard } from './EnvironmentCard';

const metadata = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  domains: ['example.com'],
};

const server = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'hetzner-fsn-1',
  owner: 'ООО Ромашка',
  host: 'srv-1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '2 vCPU, 4 ГБ',
};

const detail = {
  ...metadata,
  healthCheckPath: '/api/health',
  notes: 'Заметка',
  server,
  platforms: [],
  rootDomains: [{ id: '33333333-3333-3333-3333-333333333333', name: 'example.com' }],
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
};

describe('EnvironmentCard', () => {
  it('показывает имя, вид и домены', () => {
    render(<EnvironmentCard environment={metadata} />);

    expect(screen.getByText('Прод')).toBeInTheDocument();
    expect(screen.getByText('Продакшен')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('на уровне метаданных не показывает серверные параметры', () => {
    // Их отсутствие в ответе — это и есть уровень доступа; показывать
    // «скрыто» здесь не нужно, секция сама объясняет ограничение.
    render(<EnvironmentCard environment={metadata} />);

    expect(screen.queryByText(/203\.0\.113\.10/)).not.toBeInTheDocument();
  });

  it('показывает путь проверки, а не отдельный адрес', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.getByText('Путь проверки')).toBeInTheDocument();
    expect(screen.getByText('/api/health')).toBeInTheDocument();
    expect(screen.queryByText('Адрес проверки')).not.toBeInTheDocument();
  });

  it('на уровне чтения показывает машину, её владельца и параметры', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.getByText('hetzner-fsn-1')).toBeInTheDocument();
    expect(screen.getByText('ООО Ромашка')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText('Hetzner')).toBeInTheDocument();
  });

  it('окружение без машины показывает это прямо', () => {
    render(<EnvironmentCard environment={{ ...detail, server: null }} />);

    expect(screen.getByText('Сервер не привязан')).toBeInTheDocument();
  });

  it('адрес окружения показывают его домены', () => {
    render(<EnvironmentCard environment={{ ...detail, domains: ['stage.example.com'] }} />);

    expect(screen.getByText('stage.example.com')).toBeInTheDocument();
  });

  it('без права записи не показывает кнопок', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('с правом записи вызывает правку', async () => {
    const onEdit = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={onEdit} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));

    expect(onEdit).toHaveBeenCalled();
  });

  it('удаление требует подтверждения', async () => {
    // Браузерный диалог заблокировал бы страницу, поэтому подтверждение
    // спрашивается на месте.
    const onDelete = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('отменяет удаление', async () => {
    const onDelete = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });

  it('суперадмину ведёт с машины в её карточку реестра', () => {
    // `server.id` в контракте был, а печаталось имя текстом: суперадмин,
    // увидев машину окружения, не мог к ней перейти.
    render(<EnvironmentCard environment={detail} isSuperadmin />);

    // Адрес именно карточки: страницы `/servers/:id` в приложении нет,
    // и ссылка на неё отвечала бы «не найдено».
    expect(screen.getByRole('link', { name: 'hetzner-fsn-1' })).toHaveAttribute(
      'href',
      `/servers/${server.id}/edit`,
    );
  });

  it('не-суперадмину машина остаётся текстом', () => {
    // Реестр машин закрыт правом суперадмина: ссылка в него обещала бы
    // экран, который ответит отказом.
    render(<EnvironmentCard environment={detail} />);

    expect(screen.queryByRole('link', { name: 'hetzner-fsn-1' })).not.toBeInTheDocument();
    expect(screen.getByText('hetzner-fsn-1')).toBeInTheDocument();
  });

  it('суперадмину ведёт в карточку корня адреса', () => {
    // Корень правит только суперадмин, и переход нужен именно в его
    // карточку: оттуда видно владельца, регистратора и срок продления.
    render(<EnvironmentCard environment={detail} isSuperadmin />);

    expect(screen.getByRole('link', { name: 'Корень example.com' })).toHaveAttribute(
      'href',
      '/domains/33333333-3333-3333-3333-333333333333/edit',
    );
  });

  it('называет каждый корень отдельно', () => {
    // Адресов у окружения несколько, и корень у каждого свой: одной
    // ссылки «в реестр» для двух зон не хватает.
    render(
      <EnvironmentCard
        environment={{
          ...detail,
          domains: ['stage.example.com', 'api.shop.co.uk'],
          rootDomains: [
            { id: '33333333-3333-3333-3333-333333333333', name: 'example.com' },
            { id: '44444444-4444-4444-4444-444444444444', name: 'shop.co.uk' },
          ],
        }}
        isSuperadmin
      />,
    );

    expect(screen.getByRole('link', { name: 'Корень example.com' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Корень shop.co.uk' })).toHaveAttribute(
      'href',
      '/domains/44444444-4444-4444-4444-444444444444/edit',
    );
  });

  it('без корней в ответе предлагает реестр целиком', () => {
    // Пустой список означает «идентификаторы реестра не выданы»;
    // у суперадмина так бывает только на проекции метаданных.
    render(<EnvironmentCard environment={{ ...detail, rootDomains: [] }} isSuperadmin />);

    expect(screen.getByRole('link', { name: 'Реестр доменов' })).toHaveAttribute(
      'href',
      '/domains',
    );
  });

  it('не-суперадмину реестр доменов не предлагается', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.queryByRole('link', { name: 'Реестр доменов' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Корень example.com' })).not.toBeInTheDocument();
  });

  it('показывает развёрнутые платформы', () => {
    // Строится на проекции чтения: поля детали карточка показывает
    // только под ней, и на метаданных чипы не отрисовались бы.
    render(
      <EnvironmentCard
        environment={{
          ...detail,
          platforms: [{ id: 'p1', kind: PlatformKind.Server, name: 'API' }],
        }}
      />,
    );

    expect(screen.getByText('API')).toBeInTheDocument();
  });
});
