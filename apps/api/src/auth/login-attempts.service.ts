import { Injectable } from '@nestjs/common';

/**
 * Ограничение перебора паролей (спека 6.2).
 *
 * Ключ составной — «адрес пользователя + адрес источника». Счётчик по одному
 * лишь адресу пользователя дал бы вектор отказа в обслуживании: зная почту
 * суперадмина, достаточно раз в четверть часа делать десяток неверных
 * попыток, чтобы держать его вне системы.
 *
 * Состояние хранится в памяти процесса: при перезапуске счётчики обнуляются,
 * и это приемлемо — защита рассчитана на автоматический перебор, а не на
 * целенаправленную атаку, от которой защищает второй фактор. При добавлении
 * второго экземпляра `api` счётчик потребуется вынести в общее хранилище.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly failures = new Map<string, number[]>();

  /** Проверяет, исчерпан ли лимит попыток для пары. */
  isBlocked(email: string, ip: string): boolean {
    return this.recentFailures(buildKey(email, ip)).length >= MAX_FAILURES;
  }

  /** Отмечает неудачную попытку. */
  registerFailure(email: string, ip: string): void {
    const key = buildKey(email, ip);

    this.failures.set(key, [...this.recentFailures(key), Date.now()]);
  }

  /** Сбрасывает счётчик после успешного входа. */
  registerSuccess(email: string, ip: string): void {
    this.failures.delete(buildKey(email, ip));
  }

  /** Возвращает попытки, попадающие в текущее окно, попутно отбрасывая старые. */
  private recentFailures(key: string): number[] {
    const threshold = Date.now() - WINDOW_MS;
    const recent = (this.failures.get(key) ?? []).filter((at) => at > threshold);

    if (recent.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, recent);
    }

    return recent;
  }
}

/** Строит ключ счётчика. Регистр адреса не различается. */
function buildKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

/** Порог блокировки. */
const MAX_FAILURES = 10;

/** Окно наблюдения и срок блокировки — 15 минут. */
const WINDOW_MS = 15 * 60 * 1000;
