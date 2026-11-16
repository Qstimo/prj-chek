/**
 * Настройки проверок статуса.
 *
 * Пределы ожидания были зашиты числом `10_000` в четырёх файлах: прогон,
 * уходящий в сеть, обязан быть настраиваемым на месте — боевой стенд за
 * медленным каналом и локальная разработка хотят разного, а пересобирать
 * образ ради секунды нельзя.
 *
 * Значения читаются при каждом вызове, а не при загрузке модуля: иначе
 * настройка зависела бы от порядка импортов, а тесты не могли бы её
 * менять.
 *
 * Имена переменных окружения живут в самих проверяльщиках — там, где их
 * смысл виден; здесь только разбор значения и умолчания.
 */

/** Предел ожидания любой из проверок по умолчанию, в секундах. */
export const DEFAULT_CHECK_TIMEOUT_SECONDS = 10;

/**
 * Попыток запроса к DNS по умолчанию.
 *
 * Две, а не одна: DNS ходит по UDP, и потерянный пакет читался как
 * «имени нет» — разрешение пропадало, а предупреждение о расхождении
 * мигало на ровном месте.
 */
export const DEFAULT_DNS_TRIES = 2;

/**
 * Сколько держать ответ реестра, в часах.
 *
 * Сутки: срок регистрации меняется раз в год, а прогон идёт каждые
 * четверть часа.
 */
export const DEFAULT_RDAP_CACHE_HOURS = 24;

/** Предел ожидания в миллисекундах; мусор и неположительное — умолчание. */
export function timeoutMsOf(
  value: string | undefined,
  defaultSeconds: number = DEFAULT_CHECK_TIMEOUT_SECONDS,
): number {
  return positiveOf(value, defaultSeconds) * 1000;
}

/** Число попыток запроса к DNS; мусор и неположительное — умолчание. */
export function triesOf(value: string | undefined): number {
  return Math.round(positiveOf(value, DEFAULT_DNS_TRIES));
}

/**
 * Срок жизни кэша реестра в миллисекундах.
 *
 * `0` здесь означает «не кэшировать» — в отличие от предела ожидания, у
 * кэша выключатель нужен: это ускорение, а не часть правила, и в тестах
 * без него не обойтись.
 */
export function cacheMsOf(value: string | undefined): number {
  if (value !== undefined && value.trim() === '0') {
    return 0;
  }

  return positiveOf(value, DEFAULT_RDAP_CACHE_HOURS) * 60 * 60 * 1000;
}

/** Положительное число из настройки либо умолчание. */
function positiveOf(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
