import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MAX_TAGS } from './constants';
import { TagsField } from './TagsField';

describe('TagsField', () => {
  it('отдаёт набор целиком при добавлении своего тега', async () => {
    const onChange = vi.fn();
    render(<TagsField tags={['Web']} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Свой тег'), 'Product');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить тег' }));

    expect(onChange).toHaveBeenCalledWith(['Web', 'Product']);
  });

  it('отдаёт набор без снятого тега', async () => {
    const onChange = vi.fn();
    render(<TagsField tags={['Web', 'Product']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать Web' }));

    expect(onChange).toHaveBeenCalledWith(['Product']);
  });

  it('снятие тега не спрашивает подтверждения', async () => {
    // В отличие от платформы: за тегом не стоит ни выпусков, ни
    // привязок, и вернуть его стоит одного клика.
    const onChange = vi.fn();
    render(<TagsField tags={['Web']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать Web' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('не добавляет повтор, различимый только регистром', async () => {
    // Сервер сведёт «Web» и «web» к одному тегу и отвергнет набор целиком.
    const onChange = vi.fn();
    render(<TagsField tags={['Web']} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Свой тег'), 'web');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить тег' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('не добавляет пустое название', async () => {
    const onChange = vi.fn();
    render(<TagsField tags={[]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Свой тег'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить тег' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('предлагает словарь и не предлагает уже взятое', () => {
    render(<TagsField tags={['Web']} onChange={vi.fn()} suggestions={['Web', 'Product']} />);

    expect(screen.getByRole('button', { name: '+ Product' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Web' })).not.toBeInTheDocument();
  });

  it('подсказка добавляет тег одним кликом', async () => {
    const onChange = vi.fn();
    render(<TagsField tags={[]} onChange={onChange} suggestions={['Web']} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Web' }));

    expect(onChange).toHaveBeenCalledWith(['Web']);
  });

  it('на пределе не даёт добавить и говорит почему', () => {
    // Поле обязано отказывать там же, где откажет сервер, иначе лишний
    // чип появился бы на экране и исчез при сохранении.
    const full = Array.from({ length: MAX_TAGS }, (_, index) => `Тег ${index}`);
    render(<TagsField tags={full} onChange={vi.fn()} suggestions={['Web']} />);

    expect(screen.getByRole('button', { name: 'Добавить тег' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '+ Web' })).not.toBeInTheDocument();
    expect(screen.getByText(/не бывает/i)).toBeInTheDocument();
  });
});
