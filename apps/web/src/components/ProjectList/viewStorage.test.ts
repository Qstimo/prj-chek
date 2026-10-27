import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PROJECT_LIST_VIEW,
  PROJECT_LIST_VIEW_KEY,
  readProjectListView,
  writeProjectListView,
} from './viewStorage';

describe('viewStorage', () => {
  afterEach(() => {
    window.localStorage.removeItem(PROJECT_LIST_VIEW_KEY);
  });

  it('без записи возвращает строки', () => {
    expect(readProjectListView()).toBe(DEFAULT_PROJECT_LIST_VIEW);
  });

  it('читает сохранённые карточки', () => {
    writeProjectListView('cards');
    expect(readProjectListView()).toBe('cards');
  });

  it('неизвестное значение сбрасывает к дефолту', () => {
    window.localStorage.setItem(PROJECT_LIST_VIEW_KEY, 'tiles');
    expect(readProjectListView()).toBe('rows');
  });
});
