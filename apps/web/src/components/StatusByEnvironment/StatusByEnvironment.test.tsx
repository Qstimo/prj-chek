import {
  HealthState,
  StatusCheckCode,
  type DomainStatus,
  type EnvironmentStatus,
} from '@cairn/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StatusByEnvironment } from './StatusByEnvironment';

const ENVIRONMENT_ID = '11111111-1111-1111-1111-111111111111';

const prod: EnvironmentStatus = {
  environmentId: ENVIRONMENT_ID,
  name: 'Прод',
  health: HealthState.Up,
  checkedAt: '2026-09-17T10:00:00.000Z',
};

function address(overrides: Partial<DomainStatus> = {}): DomainStatus {
  return {
    domainId: '22222222-2222-2222-2222-222222222222',
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health: HealthState.Up,
    latencyMs: 42,
    healthError: null,
    healthCode: null,
    redirectTo: null,
    resolvedIp: '203.0.113.10',
    resolvedIps: ['203.0.113.10'],
    resolveError: null,
    tlsValidTo: '2027-01-01T00:00:00.000Z',
    tlsTrusted: true,
    tlsCode: null,
    tlsError: null,
    registryExpiresAt: '2027-06-01T00:00:00.000Z',
    registryError: null,
    checkedAt: '2026-09-17T10:00:00.000Z',
    ...overrides,
  };
}

/** Строка таблицы по имени адреса. */
function row(name = 'stage.example.com') {
  return screen.getByRole('article', { name });
}

describe('StatusByEnvironment', () => {
  it('сохраняет полный длинный redirect и название окружения при выборе адреса', async () => {
    const redirectTo = `https://example.com/${'AuthenticationRedirectTarget'.repeat(30)}`;
    const name = 'LongEnvironmentName'.repeat(20);
    const onSelect = vi.fn();
    render(<StatusByEnvironment environments={[{ ...prod, name }]} addresses={[address({ healthCode: StatusCheckCode.Redirect, redirectTo })]} onSelect={onSelect} />);
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes(redirectTo))).toHaveTextContent(redirectTo);
    await userEvent.click(screen.getByRole('button', { name: 'stage.example.com' }));
    expect(onSelect).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });
  it('показывает адреса под их окружением', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    const group = screen.getByRole('region', { name: 'Прод' });

    expect(within(group).getByText('stage.example.com')).toBeInTheDocument();
  });

  it('называет независимые проверки в карточке без тесной таблицы', () => {
    // Таблица отвечает на вопрос «что проверяли»: три проверки разнесены
    // по столбцам, а не слиты в одну фразу.
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(screen.getByText('Доступность')).toBeInTheDocument();
    expect(screen.getByText('Сертификат TLS')).toBeInTheDocument();
    expect(screen.getByText('Регистрация домена')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('у мёртвого адреса показывает причину', () => {
    // Именно это отвечает на вопрос «что чинить».
    const dead = address({
      health: HealthState.Down,
      latencyMs: null,
      healthError: 'сервер ответил ошибкой (HTTP 502)',
      healthCode: StatusCheckCode.ServerError,
    });

    render(<StatusByEnvironment environments={[prod]} addresses={[dead]} />);

    expect(screen.getByText(/не отвечает \(сервер ответил ошибкой \(HTTP 502\)\)/)).toBeInTheDocument();
  });

  it('у живого адреса показывает задержку, сертификат и срок', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(within(row()).getByText('работает, 42 мс')).toBeInTheDocument();
    expect(within(row()).getByText('до 01.01.2027')).toBeInTheDocument();
    expect(within(row()).getByText('до 01.06.2027')).toBeInTheDocument();
  });

  it('непроверенный адрес говорит об этом, а не молчит', () => {
    const fresh = address({
      health: null,
      latencyMs: null,
      tlsValidTo: null,
      tlsTrusted: null,
      registryExpiresAt: null,
      checkedAt: null,
    });

    render(<StatusByEnvironment environments={[prod]} addresses={[fresh]} />);

    expect(within(row()).getAllByText('Результата ещё нет')).toHaveLength(3);
    expect(within(row()).getByText(/Ожидает первой проверки/)).toBeInTheDocument();
  });

  it('ошибку проверки сертификата показывает вместо срока', () => {
    const broken = address({ tlsValidTo: null, tlsTrusted: null, tlsError: 'нет соединения' });

    render(<StatusByEnvironment environments={[prod]} addresses={[broken]} />);

    expect(screen.getByText('не проверить: нет соединения')).toBeInTheDocument();
  });

  it('недоверенный сертификат не выглядит действующим', () => {
    // Пока в строке лежал один срок, зелёное «до 2027» уживалось с
    // красным «не отвечает»: fetch отвергал сертификат, которому
    // проверка TLS верила.
    const untrusted = address({
      tlsTrusted: false,
      tlsCode: StatusCheckCode.CertificateUntrusted,
      tlsError: 'сертификат не вызывает доверия (DEPTH_ZERO_SELF_SIGNED_CERT)',
    });

    render(<StatusByEnvironment environments={[prod]} addresses={[untrusted]} />);

    expect(screen.getByText(/не доверяем/)).toBeInTheDocument();
    expect(screen.queryByText('до 01.01.2027')).not.toBeInTheDocument();
  });

  it('живой адрес за авторизацией объясняет, почему он зелёный', () => {
    // 401 — рабочее состояние стенда: предупреждения нет вовсе, и без
    // пометки человек не понял бы, что увидела проверка.
    const closed = address({ healthCode: StatusCheckCode.AuthRequired });

    render(<StatusByEnvironment environments={[prod]} addresses={[closed]} />);

    expect(screen.getByText(/закрыто авторизацией/)).toBeInTheDocument();
  });

  it('перенаправление называет цель', () => {
    const moved = address({
      healthCode: StatusCheckCode.Redirect,
      redirectTo: 'https://example.com/health',
    });

    render(<StatusByEnvironment environments={[prod]} addresses={[moved]} />);

    expect(screen.getByText(/https:\/\/example\.com\/health/)).toBeInTheDocument();
  });

  it('показывает время проверки один раз у адреса без повторов в заголовке', () => {
    // `checkedAt` считался на сервере и до экрана не доезжал: человек не
    // знал, насколько свежее то, на что он смотрит.
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(screen.getAllByText(/17\.09\.2026, 13:00/)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Прод' })).not.toHaveTextContent(/2026/);
  });

  it.each(['реестр ответил HTTP 403', 'RDAP: зона .ru не поддерживается в IANA; срок регистрации недоступен'])('ошибка реестра нейтральна, диагностика только в деталях: %s', async (registryError) => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address({ registryError, registryExpiresAt: null })]} />);
    const card = row();
    expect(within(card).getByText('Сведения реестра недоступны')).toHaveClass('text-muted-foreground', { exact: false });
    expect(within(card).getByText(/В сети/)).toBeInTheDocument();
    const diagnostic = within(card).getByText(`Ответ поставщика: ${registryError}`);
    expect(diagnostic.closest('details')).not.toHaveAttribute('open');
    await userEvent.click(within(card).getByText('Почему нет данных'));
    expect(diagnostic.closest('details')).toHaveAttribute('open');
    expect(within(card).getByText(/Это не означает, что сайт недоступен/)).toBeInTheDocument();
  });

  it('выделяет близкий срок TLS', () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    render(<StatusByEnvironment environments={[prod]} addresses={[address({ tlsValidTo: soon })]} />);
    expect(screen.getByText(/До истечения: 3 дн/).closest('div')).toHaveClass('bg-amber-500/10');
  });

  it('не называет машину: её имя принадлежит уровню чтения', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(screen.queryByText(/hetzner/i)).not.toBeInTheDocument();
  });

  it('окружение без адресов говорит, что проверять нечего', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[]} />);

    expect(screen.getByText(/нет адресов/i)).toBeInTheDocument();
  });

  it('чужой адрес под окружение не подставляется', () => {
    const other = address({ environmentId: '33333333-3333-3333-3333-333333333333' });

    render(<StatusByEnvironment environments={[prod]} addresses={[other]} />);

    expect(screen.queryByText('stage.example.com')).not.toBeInTheDocument();
  });

  it('по клику на адрес открывает его разбор', async () => {
    const onSelect = vi.fn();
    render(
      <StatusByEnvironment environments={[prod]} addresses={[address()]} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'stage.example.com' }));

    expect(onSelect).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('без обработчика адрес остаётся текстом, а не мёртвой кнопкой', () => {
    render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
