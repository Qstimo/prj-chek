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

  it('предлагает известные адреса', async () => {
    render(<DomainsField value={[]} onChange={vi.fn()} knownDomains={['api.example.com']} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'api');

    expect(screen.getByRole('option', { name: 'api.example.com' })).toBeInTheDocument();
  });

  it('добавляет адрес выбором из списка', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={[]} onChange={onChange} knownDomains={['api.example.com']} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'api');
    await userEvent.click(screen.getByRole('option', { name: 'api.example.com' }));

    expect(onChange).toHaveBeenCalledWith(['api.example.com']);
  });

  it('не предлагает уже добавленное', async () => {
    render(
      <DomainsField
        value={['api.example.com']}
        onChange={vi.fn()}
        knownDomains={['api.example.com', 'stage.example.com']}
      />,
    );

    await userEvent.type(screen.getByLabelText('Домены'), 'example');

    expect(screen.queryByRole('option', { name: 'api.example.com' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'stage.example.com' })).toBeInTheDocument();
  });

  it('позволяет завести адрес, которого нет в списке', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={[]} onChange={onChange} knownDomains={[]} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'new.example.com');
    await userEvent.click(screen.getByRole('option', { name: /Создать/ }));

    expect(onChange).toHaveBeenCalledWith(['new.example.com']);
  });

  it('без списка работает как обычное поле ввода', async () => {
    // Правило спеки: подрядчику список не показывается вовсе — иначе он
    // увидел бы чужие адреса, а через них существование чужих проектов.
    render(<DomainsField value={[]} onChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'api');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('называет корень набранного адреса', async () => {
    // Разбор считается из набранного самим человеком и потому не
    // раскрывает ничего чужого — его видят все. А вот судьбу корня без
    // реестра знать неоткуда, и придумывать её нельзя.
    render(<DomainsField value={[]} onChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'api.example.com');

    expect(screen.getByText('Корень: example.com')).toBeInTheDocument();
  });

  it('знает, что корень уже в реестре', async () => {
    render(<DomainsField value={[]} onChange={vi.fn()} knownDomains={['stage.example.com']} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'api.example.com');

    expect(screen.getByText('Корень: example.com — уже в реестре')).toBeInTheDocument();
  });
});
