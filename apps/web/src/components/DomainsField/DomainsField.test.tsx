import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DomainsField } from './DomainsField';

describe('DomainsField', () => {
  it('показывает добавленные домены', () => {
    render(<DomainsField value={['example.com']} onChange={vi.fn()} />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('добавляет домен', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={[]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));

    expect(onChange).toHaveBeenCalledWith(['example.com']);
  });

  it('не добавляет пустую строку', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={[]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('не добавляет повторяющийся домен', async () => {
    // Сервер отверг бы такой набор, и лучше сказать об этом сразу.
    const onChange = vi.fn();
    render(<DomainsField value={['example.com']} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'EXAMPLE.com');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/уже добавлен/i);
  });

  it('удаляет домен', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={['example.com', 'api.example.com']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать example.com' }));

    expect(onChange).toHaveBeenCalledWith(['api.example.com']);
  });
});
