import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginAttemptsService } from './login-attempts.service';

describe('LoginAttemptsService', () => {
  let service: LoginAttemptsService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new LoginAttemptsService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function failTenTimes(email = 'user@cairn.local', ip = '10.0.0.1'): void {
    for (let index = 0; index < 10; index += 1) {
      service.registerFailure(email, ip);
    }
  }

  it('пропускает первую попытку', () => {
    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('блокирует после десяти неудач', () => {
    failTenTimes();

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(true);
  });

  it('не блокирует на девятой неудаче', () => {
    for (let index = 0; index < 9; index += 1) {
      service.registerFailure('user@cairn.local', '10.0.0.1');
    }

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('не блокирует тот же адрес с другого источника', () => {
    // Составной ключ: иначе перебор с чужой машины закрывал бы вход
    // владельцу учётной записи (спека 6.2).
    failTenTimes('user@cairn.local', '10.0.0.1');

    expect(service.isBlocked('user@cairn.local', '10.0.0.2')).toBe(false);
  });

  it('не блокирует другой адрес с того же источника', () => {
    failTenTimes('user@cairn.local', '10.0.0.1');

    expect(service.isBlocked('other@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('снимает блокировку через пятнадцать минут', () => {
    failTenTimes();

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('удерживает блокировку до истечения срока', () => {
    failTenTimes();

    vi.advanceTimersByTime(14 * 60 * 1000);

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(true);
  });

  it('сбрасывает счётчик при успешном входе', () => {
    for (let index = 0; index < 9; index += 1) {
      service.registerFailure('user@cairn.local', '10.0.0.1');
    }
    service.registerSuccess('user@cairn.local', '10.0.0.1');
    service.registerFailure('user@cairn.local', '10.0.0.1');

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('не различает регистр адреса', () => {
    failTenTimes('User@Cairn.Local', '10.0.0.1');

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(true);
  });
});
