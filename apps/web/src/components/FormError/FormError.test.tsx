import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormError } from './FormError';

describe('FormError', () => {
  it('показывает отказ так, чтобы его услышали', () => {
    render(<FormError message="Недостаточно прав" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Недостаточно прав');
  });

  it('без сообщения не занимает места', () => {
    const { container } = render(<FormError />);

    expect(container).toBeEmptyDOMElement();
  });

  it('сохраняет разбор по полям построчно', () => {
    // Сервер присылает по строке на поле, и склеивать их в одну нельзя.
    render(<FormError message={'Название: заполните поле\nДомены: Ожидается домен'} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Название');
    expect(screen.getByRole('alert')).toHaveTextContent('Домены');
  });
});
