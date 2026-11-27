import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WhatsNewPage from './page';

describe('WhatsNewPage', () => {
  it('рендерит страницу с заголовком «Что нового»', () => {
    render(<WhatsNewPage />);

    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Что нового' }))
      .toBeInTheDocument();
  });

  it('показывает четыре карточки с пояснениями и подсказками', () => {
    render(<WhatsNewPage />);

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(4);

    const expected = [
      ['Саммари', 'Созвон превращается в саммари и черновик задач.', 'Как пользоваться: загрузите запись созвона на экране «Саммари» — текст и задачи появятся сами.'],
      ['Выгрузка задач в Weeek', 'Задачи уезжают на доску одним действием.', 'Как пользоваться: откройте вкладку «Задачи», отметьте нужные строки и нажмите «Выгрузить выбранные».'],
      ['Загрузка из Weeek', 'Можно выбрать задачи с доски и принести их в проект.', 'Как пользоваться: на вкладке «Задачи» нажмите «Подтянуть из Weeek» и выберите нужные задачи.'],
      ['Автовыполнение в релизе', 'Обновление статуса в Weeek закрывает задачу в релизе.', 'Как пользоваться: задайте колонку завершения в настройках задач — попадание в неё закроет задачу в релизе.'],
    ] as const;

    expected.forEach(([title, description, hint]) => {
      const heading = screen.getByRole('heading', { level: 2, name: title });
      expect(heading.closest('article')).toHaveTextContent(description);
      expect(heading.closest('article')).toHaveTextContent(hint);
    });
  });
});
