/**
 * Дата-день `ГГГГ-ММ-ДД` в русском формате `ДД.ММ.ГГГГ`.
 *
 * `T00:00:00` фиксирует местную полночь: без него строка дня трактуется
 * как UTC и в западных поясах дата уезжает на день назад.
 */
export function formatDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('ru-RU');
}
