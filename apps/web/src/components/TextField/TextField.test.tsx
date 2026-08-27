import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from './TextField';

describe('TextField', () => {
  it('связывает подпись с полем', () => {
    render(<TextField id="name" label="Название" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Название')).toBeInTheDocument();
  });

  it('сообщает о вводе', async () => {
    const onChange = vi.fn();
    render(<TextField id="name" label="Название" value="" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Название'), 'а');

    expect(onChange).toHaveBeenCalledWith('а');
  });

  it('отдаёт многострочное поле при multiline', () => {
    render(<TextField id="notes" label="Заметки" value="" onChange={vi.fn()} multiline />);

    expect(screen.getByLabelText('Заметки').tagName).toBe('TEXTAREA');
  });
});
