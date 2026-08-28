'use client';

import {
  useMutationCreateAgentToken,
  useMutationRevokeAgentToken,
  useMutationSetGrant,
  useMutationToggleAgentReveal,
  useQueryAgentTokens,
  useQueryGrants,
  useQueryUsers,
} from '@/api/hooks';
import { AccessMatrix } from '@/components/AccessMatrix';
import { AgentTokensPanel } from '@/components/AgentTokensPanel';

/** Пропсы экрана доступов. */
interface IProps {
  projectId: string;
}

/**
 * Управление доступами к проекту. Экран суперадмина (спека 9.1).
 *
 * Строки матрицы собираются из двух источников: списка всех пользователей
 * и выдач по этому проекту. Одних выдач недостаточно — субъект без доступа
 * в них не попадает, и выдать ему первый доступ было бы невозможно.
 *
 * Токены агентов живут здесь же: это та же модель прав, только машинный
 * субъект (ТЗ 4.1) — отдельного экрана для машин не существует.
 */
export function AccessScreen({ projectId }: IProps) {
  const grants = useQueryGrants(projectId);
  const users = useQueryUsers();
  const tokens = useQueryAgentTokens(projectId);
  const setGrant = useMutationSetGrant(projectId);
  const createToken = useMutationCreateAgentToken(projectId);
  const toggleReveal = useMutationToggleAgentReveal(projectId);
  const revokeToken = useMutationRevokeAgentToken(projectId);

  if (grants.isPending || users.isPending || tokens.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (grants.isError || users.isError || tokens.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить матрицу доступов.
      </p>
    );
  }

  const levelsBySubject = new Map(grants.data.map((row) => [row.subjectId, row.levels]));

  const rows = users.data.map((user) => ({
    subjectId: user.subjectId,
    subjectLabel: user.email,
    isRevoked: user.isRevoked,
    levels: levelsBySubject.get(user.subjectId) ?? {},
  }));

  const isTokenPending =
    createToken.isPending || toggleReveal.isPending || revokeToken.isPending;

  return (
    <div className="space-y-6">
      <AccessMatrix rows={rows} onChange={(change) => setGrant.mutate(change)} />
      {createToken.isError && (
        <p role="alert" className="text-destructive">
          Не удалось создать токен агента.
        </p>
      )}
      <AgentTokensPanel
        tokens={tokens.data}
        createdToken={createToken.data ?? null}
        onCreate={(input) => createToken.mutate(input)}
        onToggleReveal={(tokenId, value) => toggleReveal.mutate({ tokenId, value })}
        onRevoke={(tokenId) => {
          // Отзыв только что созданного токена гасит и блок с его
          // открытым значением — иначе секрет пережил бы сам токен.
          if (tokenId === createToken.data?.id) {
            createToken.reset();
          }
          revokeToken.mutate(tokenId);
        }}
        isPending={isTokenPending}
      />
    </div>
  );
}
