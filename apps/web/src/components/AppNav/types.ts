import type { CurrentSubjectResponse } from '@cairn/shared';

/** Пропсы навигации. */
export interface IProps {
  subject: CurrentSubjectResponse;
  onLogout: () => void;
}
