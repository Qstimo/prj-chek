'use client';

import { useMutationSetGrant, useQueryGrants, useQueryUsers } from '@/api/hooks';
import { AccessMatrix } from '@/components/AccessMatrix';

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
 */
export function AccessScreen({ projectId }: IProps) {
  const grants = useQueryGrants(projectId);
  const users = useQueryUsers();
  const setGrant = useMutationSetGrant(projectId);

  if (grants.isPending || users.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (grants.isError || users.isError) {
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

  return <AccessMatrix rows={rows} onChange={(change) => setGrant.mutate(change)} />;
}
