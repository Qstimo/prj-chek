import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntakeAddressPanel } from './IntakeAddressPanel';

const address = {
  token: 'abc123',
  webhookUrl: 'https://cairn.local/api/intake/abc123',
  emailAddress: 'abc123@intake.cairn.local',
};

describe('IntakeAddressPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('показывает адрес webhook и почтовую форму', () => {
    render(
      <IntakeAddressPanel
        address={address}
        isSuperadmin={false}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    expect(screen.getByText(address.webhookUrl)).toBeInTheDocument();
    expect(screen.getByText(/abc123@intake\.cairn\.local/)).toBeInTheDocument();
    expect(screen.getByText(/появится позже/i)).toBeInTheDocument();
  });

  it('копирует адрес webhook', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <IntakeAddressPanel
        address={address}
        isSuperadmin={false}
        onCreate={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(writeText).toHaveBeenCalledWith(address.webhookUrl);
    expect(screen.getByText('Скопировано')).toBeInTheDocument();
  });

  it('пишущему без адреса объясняет, кто его создаёт', () => {
    render(
      <IntakeAddressPanel address={null} isSuperadmin={false} onCreate={vi.fn()} onRevoke={vi.fn()} />,
    );

    expect(screen.getByText(/создаёт администратор/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать адрес' })).not.toBeInTheDocument();
  });

  it('суперадмину без адреса предлагает создать', async () => {
    const onCreate = vi.fn();
    render(
      <IntakeAddressPanel address={null} isSuperadmin onCreate={onCreate} onRevoke={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Создать адрес' }));

    expect(onCreate).toHaveBeenCalled();
  });

  it('отзыв требует подтверждения', async () => {
    const onRevoke = vi.fn();
    render(
      <IntakeAddressPanel address={address} isSuperadmin onCreate={vi.fn()} onRevoke={onRevoke} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отозвать адрес' }));
    expect(onRevoke).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отзыв' }));
    expect(onRevoke).toHaveBeenCalled();
  });
});
