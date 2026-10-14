import type {
  Platform,
  RoadmapVersionDetail,
  RoadmapVersionMetadata,
  RoadmapVersionUpdate,
} from '@cairn/shared';

import type { IReleaseCell, IVersionDraft, ReleaseOp } from './types';

/** Отличает проекцию чтения от проекции метаданных. */
export function isDetailed(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
): version is RoadmapVersionDetail {
  return 'checkpoints' in version;
}

/**
 * Черновик из версии: поля паспорта и клетки выпусков.
 *
 * Пустые значения становятся пустыми строками — это то, что умеют поля
 * ввода. Платформа без строки выпуска получает `null`: «как у версии».
 */
export function draftOf(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
  platforms: Platform[],
): IVersionDraft {
  const releases: Record<string, IReleaseCell | null> = {};

  for (const platform of platforms) {
    const release = isDetailed(version)
      ? version.releases.find((candidate) => candidate.platformId === platform.id)
      : undefined;

    releases[platform.id] = release
      ? {
          state: release.state,
          releasedDate: release.releasedDate ?? '',
          buildLabel: release.buildLabel ?? '',
        }
      : null;
  }

  return {
    label: version.label,
    state: version.state,
    plannedDate: version.plannedDate ?? '',
    releasedDate: version.releasedDate ?? '',
    releases,
  };
}

/**
 * Патч версии: только изменённые поля.
 *
 * Пустой объект означает «паспорт не трогать», и запроса к версии тогда
 * не будет вовсе.
 *
 * Ключ `releasedDate` у проекта с платформами не попадает в патч никогда:
 * дата принадлежит выпуску, а сервер отвергает само присутствие ключа
 * (дизайн, раздел 3). Поле формы при платформах и не показывается, но
 * черновик собирается из версии, где вычисленная дата уже есть, — без
 * этой отсечки она уехала бы в колонку.
 */
export function versionPatchOf(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
  draft: IVersionDraft,
  hasPlatforms: boolean,
): RoadmapVersionUpdate {
  const patch: RoadmapVersionUpdate = {};
  // Обозначение обрезается здесь, а не на сервере: тот обрежет его сам
  // (`z.string().trim()`), и необрезанный черновик остался бы навсегда
  // отличным от сохранённой версии — кнопка не погасла бы после записи.
  const label = draft.label.trim();

  if (label !== version.label) {
    patch.label = label;
  }

  if (draft.state !== version.state) {
    patch.state = draft.state;
  }

  if (draft.plannedDate !== (version.plannedDate ?? '')) {
    patch.plannedDate = draft.plannedDate || null;
  }

  if (!hasPlatforms && draft.releasedDate !== (version.releasedDate ?? '')) {
    patch.releasedDate = draft.releasedDate || null;
  }

  return patch;
}

/**
 * Операции над клетками выпусков: что поставить, что снять.
 *
 * Изменённая клетка отправляется целиком, даже если правилось одно поле:
 * `PUT` заменяет клетку, и посылка одного значения обнулила бы соседние.
 *
 * Порядок — порядок платформ: сводка и панель показывают их в нём же,
 * и ошибка посередине оставляет применённым начало списка, а не середину.
 *
 * На уровне метаданных выпусков в версии нет, и сравнивать нечего:
 * иначе панель сочла бы все клетки снятыми.
 */
export function releaseOpsOf(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
  draft: IVersionDraft,
  platforms: Platform[],
): ReleaseOp[] {
  if (!isDetailed(version)) {
    return [];
  }

  const ops: ReleaseOp[] = [];

  for (const platform of platforms) {
    // Ключа в черновике нет — платформу завели уже после того, как панель
    // открылась. Это «не трогали», а не «сняли»: иначе панель предложила
    // бы удалить чужой выпуск, разбудив кнопку сама.
    if (!(platform.id in draft.releases)) {
      continue;
    }

    const before = version.releases.find((candidate) => candidate.platformId === platform.id);
    const after = draft.releases[platform.id] ?? null;

    if (!after) {
      if (before) {
        ops.push({ platformId: platform.id, kind: 'clear' });
      }

      continue;
    }

    const isSame =
      before !== undefined &&
      before.state === after.state &&
      (before.releasedDate ?? '') === after.releasedDate &&
      (before.buildLabel ?? '') === after.buildLabel;

    if (!isSame) {
      ops.push({
        platformId: platform.id,
        kind: 'set',
        input: {
          state: after.state,
          releasedDate: after.releasedDate || null,
          buildLabel: after.buildLabel || null,
        },
      });
    }
  }

  return ops;
}

/**
 * Признак несохранённых изменений.
 *
 * Один для кнопки, предупреждения и подтверждения закрытия: три
 * собственных вычисления однажды разошлись бы, и кнопка стала бы активной
 * там, где предупреждения нет.
 */
export function isDirtyOf(patch: RoadmapVersionUpdate, ops: ReleaseOp[]): boolean {
  return Object.keys(patch).length > 0 || ops.length > 0;
}
