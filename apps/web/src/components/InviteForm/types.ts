import type { InviteUserInput } from '@cairn/shared';

/** Пропсы формы приглашения. */
export interface IProps {
  onSubmit: (input: InviteUserInput) => void;
  error?: string;
  isSubmitting?: boolean;
}
