import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentTokensPanel } from './AgentTokensPanel';

const token = {
  id: '11111111-1111-1111-1111-111111111111',
  label: 'Cursor Вадима',
  canRevealVariables: false,
  expiresAt: '2026-11-26T00:00:00.000Z',
  createdAt: '2026-08-28T00:00:00.000Z',
  lastUsedAt: null,
};

const created = {
  ...token,
  token: 'открытый-токен-один-раз',
  mcpUrl: 'https://cairn.local/api/mcp',
};

const noop = {
  onCreate: vi.fn(),
  onToggleReveal: vi.fn(),
  onRevoke: vi.fn(),
};

describe('AgentTokensPanel', () => {
  it('перечисляет токены со сроком и признаком значений', () => {
    render(<AgentTokensPanel tokens={[token]} createdToken={null} {...noop} />);

    expect(screen.getByText('Cursor Вадима')).toBeInTheDocument();
    expect(screen.getByText(/26\.11\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/не вызывался/i)).toBeInTheDocument();
  });

  it('создание требует имени и предупреждает о флаге значений', async () => {
    const onCreate = vi.fn();
    render(<AgentTokensPanel tokens={[]} createdToken={null} {...noop} onCreate={onCreate} />);

    expect(screen.getByText(/попадут в контекст модели/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Создать токен' }));
    expect(onCreate).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Имя токена'), 'Cursor');
    await userEvent.click(screen.getByRole('button', { name: 'Создать токен' }));
    expect(onCreate).toHaveBeenCalledWith({
      label: 'Cursor',
      ttlDays: 90,
      canRevealVariables: false,
    });
  });

  it('созданный токен показывается один раз с конфигурацией', () => {
    render(<AgentTokensPanel tokens={[token]} createdToken={created} {...noop} />);

    expect(screen.getByText('открытый-токен-один-раз')).toBeInTheDocument();
    expect(screen.getByText(/больше не будет показан/i)).toBeInTheDocument();
    expect(screen.getByText(/api\/mcp/)).toBeInTheDocument();
  });

  it('отзыв требует подтверждения', async () => {
    const onRevoke = vi.fn();
    render(<AgentTokensPanel tokens={[token]} createdToken={null} {...noop} onRevoke={onRevoke} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отозвать' }));
    expect(onRevoke).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отзыв' }));
    expect(onRevoke).toHaveBeenCalledWith(token.id);
  });

  it('переключатель значений зовёт обработчик', async () => {
    const onToggleReveal = vi.fn();
    render(
      <AgentTokensPanel
        tokens={[token]}
        createdToken={null}
        {...noop}
        onToggleReveal={onToggleReveal}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /значения переменных/i }));

    expect(onToggleReveal).toHaveBeenCalledWith(token.id, true);
  });
});
