import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionHistory } from './VersionHistory';

const versions = [
  { versionNo: 2, createdAt: '2026-08-28T10:00:00.000Z', createdByLabel: 'admin@cairn.local' },
  { versionNo: 1, createdAt: '2026-08-27T10:00:00.000Z', createdByLabel: 'admin@cairn.local' },
];

describe('VersionHistory', () => {
  it('показывает версии с автором', () => {
    render(<VersionHistory versions={versions} onReveal={vi.fn()} onRollback={vi.fn()} />);

    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getAllByText(/admin@cairn\.local/)).toHaveLength(2);
  });

  it('раскрывает историческое значение по запросу', async () => {
    const onReveal = vi.fn().mockResolvedValue({ value: 'старое значение', versionNo: 1 });
    render(<VersionHistory versions={versions} onReveal={onReveal} onRollback={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Раскрыть' })[1]!);

    expect(onReveal).toHaveBeenCalledWith(1);
    expect(await screen.findByText('старое значение')).toBeInTheDocument();
  });

  it('без права записи не предлагает откат', () => {
    render(<VersionHistory versions={versions} onReveal={vi.fn()} onRollback={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Откатить' })).not.toBeInTheDocument();
  });

  it('откат требует подтверждения', async () => {
    const onRollback = vi.fn();
    render(
      <VersionHistory versions={versions} canWrite onReveal={vi.fn()} onRollback={onRollback} />,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Откатить' })[1]!);
    expect(onRollback).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить откат' }));
    expect(onRollback).toHaveBeenCalledWith(1);
  });
});
