import { ProjectLifecycle, type ProjectMetadata } from '@cairn/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SummaryForm } from './SummaryForm';

const PROJECT: ProjectMetadata = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'cairn',
  name: 'CAIRN',
  lifecycle: ProjectLifecycle.Active,
};

/** Файл с заданным содержимым и именем. */
function fileWith(text: string, name: string): File {
  return new File([text], name);
}

describe('форма создания саммари', () => {
  it('пустой список проектов объясняет, почему, и формы не показывает', () => {
    // Прятать вкладку значило бы считать выдачи при отрисовке навигации,
    // а форма без единой цели предлагала бы заполнить то, что некуда
    // отправить (дизайн, раздел 7.2: «вместо формы объяснение»).
    render(<SummaryForm projects={[]} onSubmit={vi.fn()} />);

    expect(screen.getByText(/писать хронику/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Создать/ })).not.toBeInTheDocument();
  });

  it('пустой заголовок и пустой текст отправлять не дают', async () => {
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Создать/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'обсудили сроки');

    expect(screen.getByRole('button', { name: /Создать/ })).toBeEnabled();
  });

  it('загруженный файл кладёт содержимое в правимое поле', async () => {
    // Человек видит и может поправить то, что отправляет.
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('текст', 'n.txt'));

    // Чтение файла асинхронно: поле наполняется после ответа FileReader.
    await waitFor(() => expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('текст'));
  });

  it('непустое поле заменяется файлом только после подтверждения', async () => {
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'моё');

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('чужое', 'n.txt'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('моё');

    await userEvent.click(screen.getByRole('button', { name: 'Заменить' }));

    expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('чужое');
  });

  it('негодный файл объясняет отказ и не трогает поле', async () => {
    // Событием, а не `upload`: тот отбрасывает файл по атрибуту `accept`
    // и до проверки расширения дело не доходит. В браузере `accept` —
    // подсказка диалога, которую человек обходит пунктом «Все файлы»,
    // поэтому проверка в коде остаётся настоящей защитой.
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'моё');

    fireEvent.change(screen.getByLabelText(/Загрузить файл/), {
      target: { files: [fileWith('данные', 'n.pdf')] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/\.txt/));
    expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('моё');
  });

  it('имя файла нигде не показывается и не уходит', async () => {
    // Имена файлов на машинах людей нередко говорят больше содержимого.
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.upload(
      screen.getByLabelText(/Загрузить файл/),
      fileWith('текст', 'секретный-проект.txt'),
    );
    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('секретный-проект');
    expect(document.body.textContent).not.toContain('секретный-проект');
  });

  it('отправляет выбранный проект и обрезанные поля', async () => {
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Заголовок/), '  Созвон  ');
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'обсудили сроки');
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(onSubmit).toHaveBeenCalledWith(PROJECT.id, {
      occurredOn: expect.any(String),
      title: 'Созвон',
      text: 'обсудили сроки',
    });
  });

  it('текст с управляющими символами отправить не даёт', async () => {
    // Нормализация общая с сервером: отказать до отправки честнее, чем
    // получить `400` на том же месте. Вставка, а не набор: управляющий
    // символ попадает в поле буфером обмена, а не с клавиатуры.
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');
    fireEvent.change(screen.getByLabelText(/Текст саммари/), {
      target: { value: 'раздва' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
