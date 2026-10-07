import { PlatformReleaseState } from '@cairn/shared';

import { RELEASE_STATE_CLASSES, RELEASE_STATE_LABELS } from './constants';

/** Пропсы плашки состояния. */
interface IProps {
  state: PlatformReleaseState;
  /** Обозначение сборки, если своё, иначе обозначение версии. */
  label: string;
}

/**
 * Плашка состояния выпуска.
 *
 * Состояние читается подписью, а не одним цветом: цвет — подсказка,
 * а не носитель смысла.
 */
export function ReleaseBadge({ state, label }: IProps) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${RELEASE_STATE_CLASSES[state]}`}>
      {`${RELEASE_STATE_LABELS[state]} ${label}`}
    </span>
  );
}
