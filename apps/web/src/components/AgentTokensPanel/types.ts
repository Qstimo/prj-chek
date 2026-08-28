import type { AgentToken, AgentTokenCreate, AgentTokenCreated } from '@cairn/shared';

/** Пропсы панели токенов агентов. */
export interface IProps {
  /** Токены проекта — без открытых значений. */
  tokens: AgentToken[];
  /** Только что созданный токен: открытое значение показывается один раз. */
  createdToken: AgentTokenCreated | null;
  onCreate: (input: AgentTokenCreate) => void;
  onToggleReveal: (tokenId: string, value: boolean) => void;
  onRevoke: (tokenId: string) => void;
  isPending?: boolean;
}
