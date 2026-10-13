'use client';

import type { UserGrantRow, UserRow } from '@cairn/shared';
import { useState } from 'react';

import { useMutationSetUserGrant, useQueryProjects, useQueryUserGrants } from '@/api/hooks';
import { FULL_ACCESS_NOTE } from '@/components/AccessMatrix/constants';
import { UserGrantsMatrix } from '@/components/UserGrantsMatrix';

/** Пропсы блока доступов. */
interface IProps {
  user: UserRow;
}

/**
 * Доступы человека: матрица «проект × секция».
 *
 * Только что добавленный проект живёт в состоянии экрана: выдач у него
 * ещё нет, и с сервера он не придёт. После перезагрузки строка без выдач
 * исчезает — отсутствие доступа и выражается отсутствием строки.
 */
export function UserGrantsPanel({ user }: IProps) {
  const grants = useQueryUserGrants(user.id);
  const projects = useQueryProjects();
  const setGrant = useMutationSetUserGrant(user.id);
  const [added, setAdded] = useState<UserGrantRow[]>([]);

  if (user.isSuperadmin) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Доступы</h2>
        <p className="text-muted-foreground">{FULL_ACCESS_NOTE}</p>
      </section>
    );
  }

  if (grants.isPending || projects.isPending) {
    return <p className="text-muted-foreground">Загрузка доступов…</p>;
  }

  if (grants.isError || projects.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить доступы.
      </p>
    );
  }

  const known = grants.data;
  const rows = [...known, ...added.filter((row) => !known.some((kept) => kept.projectId === row.projectId))];
  const taken = new Set(rows.map((row) => row.projectId));

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Доступы</h2>

      <UserGrantsMatrix
        rows={rows}
        candidates={projects.data
          .filter((project) => !taken.has(project.id))
          .map((project) => ({ id: project.id, name: project.name }))}
        onAddProject={(projectId) => {
          const project = projects.data.find((candidate) => candidate.id === projectId);

          if (project) {
            setAdded((current) => [
              ...current,
              { projectId, projectName: project.name, levels: {} },
            ]);
          }
        }}
        onChange={(projectId, change) =>
          setGrant.mutate({ projectId, change: { ...change, subjectId: user.subjectId } })
        }
      />
    </section>
  );
}
