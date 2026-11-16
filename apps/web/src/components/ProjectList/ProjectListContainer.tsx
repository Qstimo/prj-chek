'use client';

import { useQueryProjects } from '@/api/hooks/useQueryProjects';

import { ProjectList } from './ProjectList';
import type { IProps } from './types';

/** Серверная сводка сразу видна, затем обновляется при возврате из инфраструктуры. */
export function ProjectListContainer({ projects, ...props }: IProps) {
  const query = useQueryProjects(projects);

  return <ProjectList {...props} projects={query.data ?? projects} />;
}
