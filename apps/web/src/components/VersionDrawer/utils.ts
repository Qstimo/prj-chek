import {
  RoadmapVersionState,
  type Platform,
  type RoadmapVersionDetail,
  type RoadmapVersionMetadata,
  type RoadmapVersionUpdate,
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

/**
 * Текст пометки «выпущено, но не закрыто».
 *
 * Без упрёка и без запрета: выпуск с незакрытыми чекпоинтами разрешён
 * (решение владельца продукта), и сказать надо только о расхождении и о
 * том, что с ним можно сделать.
 */
export function unfinishedNoteOf(count: number): string {
  return `Версия выпущена, незакрытых чекпоинтов: ${count}. Их можно закрыть или перенести в следующую версию.`;
}

/**
 * Название действия переноса для кнопки и читалок.
 *
 * Цель называется до нажатия: «перенести» без ответа на вопрос «куда»
 * заставляет нажимать, чтобы узнать. Неизвестная цель называется словами
 * («в следующую версию»), а не придуманным обозначением: решение
 * принимает сервер.
 */
export function carryOverActionOf(title: string, targetLabel: string | null | undefined): string {
  return targetLabel
    ? `Перенести ${title} в ${targetLabel}`
    : `Перенести ${title} в следующую версию`;
}

/** Версия роадмапа в том объёме, который нужен для имени цели переноса. */
interface IVersionLike {
  id: string;
  label: string;
  state: RoadmapVersionState;
}

/**
 * Обозначение версии, в которую уедет чекпоинт по умолчанию.
 *
 * `stageCurrent` — та самая «текущая версия», которую посчитал сервер и
 * показывает полоса версий: своего правила выбора здесь нет намеренно,
 * иначе кнопка и полоса называли бы разные версии. Остаются два отказа,
 * совпадающие с серверным `nextOpenVersion`: выпущенная версия открытой
 * не считается, и источник переноса сам себе целью не бывает.
 *
 * `null` означает «цель посчитает сервер»: панель тогда не обещает
 * обозначения, а на отказ спрашивает его у человека.
 */
export function carryOverTargetOf(
  versions: IVersionLike[],
  stageCurrent: number | null,
  sourceVersionId: string,
): string | null {
  if (stageCurrent === null) {
    return null;
  }

  const candidate = versions[stageCurrent - 1];

  if (
    !candidate ||
    candidate.state === RoadmapVersionState.Released ||
    candidate.id === sourceVersionId
  ) {
    return null;
  }

  return candidate.label;
}
