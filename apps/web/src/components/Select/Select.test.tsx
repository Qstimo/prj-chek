import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';
import { SelectWidth } from './types';

describe('Select', () => {
  /** Две опции — минимум, на котором виден выбор. */
  const options = (
    <>
      <option value="first">Первая</option>
      <option value="second">Вторая</option>
    </>
  );

  it('отдаёт выбранное значение', async () => {
    const onChange = vi.fn();

    render(
      <Select label="Состояние" value="first" onChange={onChange}>
        {options}
      </Select>,
    );

    await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'second');

    expect(onChange).toHaveBeenCalledWith('second');
  });

  it('связывается с видимой подписью по идентификатору', () => {
    // Поля форм оставляют подпись снаружи: контрол не знает, как она
    // выглядит, и не навязывает ей разметку.
    render(
      <>
        <label htmlFor="kind">Вид</label>
        <Select id="kind" value="first" onChange={vi.fn()}>
          {options}
        </Select>
      </>,
    );

    expect(screen.getByLabelText('Вид')).toHaveValue('first');
  });

  it('показывает все переданные опции', () => {
    render(
      <Select label="Состояние" value="first" onChange={vi.fn()}>
        {options}
      </Select>,
    );

    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('узкий вариант не растягивается на всю ширину', () => {
    // Клетка матрицы доступов и чип платформы стоят в ряд с соседями:
    // полная ширина разорвала бы строку.
    render(
      <Select label="Уровень" value="first" onChange={vi.fn()} width={SelectWidth.Auto}>
        {options}
      </Select>,
    );

    expect(screen.getByLabelText('Уровень')).not.toHaveClass('w-full');
  });

  it('выключенный контрол не принимает выбор', async () => {
    const onChange = vi.fn();

    render(
      <Select label="Состояние" value="first" onChange={onChange} isDisabled>
        {options}
      </Select>,
    );

    expect(screen.getByLabelText('Состояние')).toBeDisabled();
  });
});
