import type { ReportRelease } from '@cairn/shared';

import type { CarriedOutCheckpointView, ReportCheckpointView, ReportView } from './types';

/**
 * Адрес внутренней страницы отчёта по релизу версии.
 *
 * Собирается в одном месте: тот же адрес нужен полосе версий (щелчок с
 * Ctrl), ссылке в панели версии и самой странице отчёта, и второй
 * экземпляр правила разошёлся бы с первым при переносе маршрута.
 */
export function reportHrefOf(projectId: string, versionId: string): string {
  return `/projects/${projectId}/roadmap/versions/${versionId}`;
}

/**
 * Имена платформ по идентификаторам.
 *
 * Строки выпусков — единственный источник имён в отчёте: теги чекпоинтов
 * приходят идентификаторами, а платформы проекта перечислены только там.
 */
export function platformNamesOf(releases: ReportRelease[]): Map<string, string> {
  return new Map(releases.map((row) => [row.platform.id, row.platform.name]));
}

/**
 * Теги платформ именами.
 *
 * Неизвестный тег пропускается молча: на уровне «метаданные» выпусков нет,
 * а теги есть, и падать в отчёте хуже, чем не назвать платформу. Так же
 * поступает сборщик текста на сервере.
 */
export function tagsOf(platformIds: string[], names: Map<string, string>): string[] {
  return platformIds
    .map((platformId) => names.get(platformId))
    .filter((name): name is string => name !== undefined);
}

/**
 * Адрес задачи во внешнем трекере, если он в выдаче есть.
 *
 * У публичной выдачи поля нет вовсе — не `null`, а именно нет: ссылка на
 * задачу наружу не уходит никогда, и строгая схема отчёта это проверяет.
 * Здесь это читается проверкой наличия ключа, а не отдельным пропом
 * «публичный ли отчёт», который можно забыть выставить.
 */
export function checkpointUrlOf(
  checkpoint: ReportCheckpointView | CarriedOutCheckpointView,
): string | null {
  return 'url' in checkpoint ? checkpoint.url : null;
}

/**
 * Отчёт, в котором кроме паспорта ничего нет.
 *
 * Так приходит уровень «метаданные»: ни выпусков, ни чекпоинтов. Страница
 * обязана сказать об этом словами, а не рисовать пустые разделы и не
 * падать на `undefined`.
 */
export function isBareReport(report: ReportView): boolean {
  return (
    report.releases.length === 0 &&
    report.checkpoints.length === 0 &&
    report.carriedOut.length === 0 &&
    report.summary.length === 0
  );
}

/**
 * Кладёт текст в буфер обмена и сообщает, получилось ли.
 *
 * Буфера нет без защищённого соединения и в части браузеров, а разрешение
 * могут и отозвать: исключение здесь снесло бы страницу отчёта целиком,
 * поэтому неудача — это ответ `false`, по которому страница показывает
 * текст для ручного копирования.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) {
      return false;
    }

    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    return false;
  }
}
