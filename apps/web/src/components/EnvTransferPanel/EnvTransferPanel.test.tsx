import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvTransferPanel } from './EnvTransferPanel';

describe('EnvTransferPanel', () => {
  it('без прав не показывает ни импорта, ни выгрузки', () => {
    render(<EnvTransferPanel onImport={vi.fn()} onExport={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Импортировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выгрузить .env' })).not.toBeInTheDocument();
  });

  it('импортирует вставленный текст', async () => {
    const onImport = vi.fn();
    render(<EnvTransferPanel canWrite canReveal={false} onImport={onImport} onExport={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Текст .env'), 'KEY=value');
    await userEvent.click(screen.getByRole('button', { name: 'Импортировать' }));

    expect(onImport).toHaveBeenCalledWith('KEY=value');
  });

  it('не импортирует пустой текст', async () => {
    const onImport = vi.fn();
    render(<EnvTransferPanel canWrite onImport={onImport} onExport={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Импортировать' }));

    expect(onImport).not.toHaveBeenCalled();
  });

  it('показывает итог импорта', () => {
    render(
      <EnvTransferPanel
        canWrite
        onImport={vi.fn()}
        onExport={vi.fn()}
        importResult={{ created: ['A'], updated: ['B'], unchanged: [] }}
      />,
    );

    expect(screen.getByText(/создано: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/обновлено: 1/i)).toBeInTheDocument();
  });

  it('выгрузка предупреждает о журнале и показывает текст', async () => {
    const onExport = vi.fn().mockResolvedValue('PORT=3000\n');
    render(<EnvTransferPanel canReveal onImport={vi.fn()} onExport={onExport} />);

    expect(screen.getByText(/фиксируется в журнале/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить .env' }));

    expect(onExport).toHaveBeenCalled();
    expect(await screen.findByDisplayValue(/PORT=3000/)).toBeInTheDocument();
  });
});
