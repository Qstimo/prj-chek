import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('сразу отдаёт начальное значение', () => {
    const { result } = renderHook(() => useDebouncedValue('старт', 300));

    expect(result.current).toBe('старт');
  });

  it('откладывает изменение', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'первое' },
    });

    rerender({ value: 'второе' });

    expect(result.current).toBe('первое');
  });

  it('отдаёт новое значение после задержки', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'первое' },
    });

    rerender({ value: 'второе' });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('второе');
  });

  it('отбрасывает промежуточные значения', () => {
    // Иначе быстрый набор дал бы запрос на каждый символ.
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' },
    });

    rerender({ value: 'п' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: 'пр' });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('пр');
  });
});
