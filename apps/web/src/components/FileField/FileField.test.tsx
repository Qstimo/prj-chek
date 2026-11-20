import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FILE_FIELD_TEXTS } from './constants';
import { FileField } from './FileField';

/** Поле с заданным обработчиком выбора. */
function renderField(props: { isDisabled?: boolean; picked?: string } = {}) {
  const onFile = vi.fn();

  render(
    <FileField
      id="recording"
      label="Загрузить запись"
      accept="audio/mpeg"
      hint="Принимаются MP3, файл до 2 ГБ."
      onFile={onFile}
      {...props}
    />,
  );

  return onFile;
}

/** Бросок файла на область: `dataTransfer` в jsdom свой. */
function dropFile(file: File): void {
  fireEvent.drop(screen.getByText(FILE_FIELD_TEXTS.drop), { dataTransfer: { files: [file] } });
}

describe('файловое поле', () => {
  it('подпись связана с полем, а кнопка открывает тот же выбор', () => {
    renderField();

    expect(screen.getByLabelText('Загрузить запись')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText(FILE_FIELD_TEXTS.choose)).toHaveAttribute('type', 'file');
  });

  it('выбранный кнопкой файл уходит обработчику', async () => {
    const onFile = renderField();
    // Тип у файла настоящий: `userEvent.upload` отбрасывает файлы по
    // атрибуту `accept`, и файл не того типа до обработчика не дошёл бы.
    const file = new File(['данные'], 'n.mp3', { type: 'audio/mpeg' });

    await userEvent.upload(screen.getByLabelText('Загрузить запись'), file);

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('брошенный на область файл уходит тому же обработчику', () => {
    // Второй копии проверок у броска нет: путь ровно один.
    const onFile = renderField();
    const file = new File(['данные'], 'n.txt');

    dropFile(file);

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('во время отправки бросок не принимается', () => {
    // Иначе второй файл подменил бы тот, что уже уехал наполовину.
    const onFile = renderField({ isDisabled: true });

    dropFile(new File(['данные'], 'n.txt'));

    expect(onFile).not.toHaveBeenCalled();
  });

  it('называет пределы до выбора и выбор после', () => {
    renderField({ picked: 'Выбрано: MP4, 148 МБ' });

    expect(screen.getByText(/до 2 ГБ/)).toBeInTheDocument();
    expect(screen.getByText('Выбрано: MP4, 148 МБ')).toBeInTheDocument();
  });
});
