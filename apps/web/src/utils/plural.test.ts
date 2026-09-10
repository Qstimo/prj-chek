import { describe, expect, it } from 'vitest';

import { pluralProjects, pluralSubdomains, pluralize } from './plural';

describe('склонение по числу', () => {
  it('склоняет по последней цифре', () => {
    expect(pluralProjects(1)).toBe('1 проект');
    expect(pluralProjects(2)).toBe('2 проекта');
    expect(pluralProjects(5)).toBe('5 проектов');
    expect(pluralProjects(0)).toBe('0 проектов');
  });

  it('второй десяток склоняется особо', () => {
    expect(pluralProjects(11)).toBe('11 проектов');
    expect(pluralProjects(14)).toBe('14 проектов');
    expect(pluralProjects(21)).toBe('21 проект');
  });

  it('работает для любого слова', () => {
    expect(pluralSubdomains(3)).toBe('3 поддомена');
    expect(pluralize(2, 'домен', 'домена', 'доменов')).toBe('2 домена');
  });
});
