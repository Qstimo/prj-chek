import {
  PlatformReleaseState,
  type Platform,
  type PlatformRelease,
  type ReleasePending,
  type ReleaseSummaryRow,
} from '@cairn/shared';

/** Версия глазами сводки: обозначение и место в последовательности. */
interface SummaryVersion {
  id: string;
  label: string;
}

/**
 * Выпуск глазами сводки.
 *
 * Не `PlatformRelease` из контракта: там нет `versionId`, потому что
 * выпуски отдаются вложенными в свою версию. Правилу же нужна плоская
 * таблица, и версию он берёт из самой строки.
 */
type SummaryRelease = PlatformRelease & { versionId: string };

/**
 * Сводка релизов: что у каждой платформы в релизе и что идёт за ним.
 *
 * Вычисляется, а не хранится, — как прогресс версии и стадия проекта
 * (ТЗ 3.5). Считается на сервере, потому что ту же сводку получает
 * публичная страница: повторять правило на клиенте значило бы разойтись
 * с ним при первой же правке.
 *
 * Принимает не строки базы, а то немногое, что ей нужно: так правило
 * проверяется таблицей случаев без поднятого PostgreSQL.
 *
 * Порядок версий берётся из **порядка списка**, а не из поля `position`:
 * уникальности по позиции у версий нет, правка позиции соседей не
 * перенумеровывает, и две версии могут встать на одно место. Список
 * приходит упорядоченным из выборки, и его индекс — единственный
 * детерминированный порядковый номер.
 */
export function releaseSummaryOf(
  platforms: Platform[],
  versions: SummaryVersion[],
  releases: SummaryRelease[],
): ReleaseSummaryRow[] {
  const ordinals = new Map(
    versions.map((version, index) => [version.id, { label: version.label, ordinal: index }]),
  );

  const byPlatform = new Map<string, SummaryRelease[]>();

  for (const release of releases) {
    // Выпуск неизвестной версии пропускается молча: такого быть не может,
    // пока выпуски уходят вместе с версией, а падать в сводке хуже, чем
    // не показать строку.
    if (!ordinals.has(release.versionId)) {
      continue;
    }

    byPlatform.set(release.platformId, [
      ...(byPlatform.get(release.platformId) ?? []),
      release,
    ]);
  }

  return platforms.map((platform) => {
    const own = byPlatform.get(platform.id) ?? [];
    const ordinalOf = (release: SummaryRelease) => ordinals.get(release.versionId)!.ordinal;

    const released = own
      .filter((release) => release.state === PlatformReleaseState.Released)
      .sort((first, second) => ordinalOf(first) - ordinalOf(second))
      .at(-1);

    const after = released ? ordinalOf(released) : -1;

    const pending: ReleasePending[] = own
      .filter(
        (release) =>
          release.state !== PlatformReleaseState.Released && ordinalOf(release) > after,
      )
      .sort((first, second) => ordinalOf(first) - ordinalOf(second))
      .map((release) => ({ ...refOf(release, ordinals), state: release.state }));

    return {
      platform,
      released: released ? refOf(released, ordinals) : null,
      pending,
    };
  });
}

/** Ссылка на выпуск в сводке: обозначение версии рядом с её датой. */
function refOf(
  release: SummaryRelease,
  ordinals: Map<string, { label: string; ordinal: number }>,
) {
  return {
    versionId: release.versionId,
    versionLabel: ordinals.get(release.versionId)!.label,
    buildLabel: release.buildLabel,
    date: release.releasedDate,
  };
}
