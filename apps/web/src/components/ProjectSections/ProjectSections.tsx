import { Section, type ProjectDetail, type ProjectMetadata } from '@cairn/shared';
import Link from 'next/link';

import { FIELD_LABELS } from './constants';
import type { IProps } from './types';

/**
 * Секция «Инфо» карточки проекта.
 *
 * Различает уровень доступа по составу пришедших полей: на уровне
 * метаданных API не присылает паспорт вовсе, и показывать нечего (спека 5.5).
 * Недоступные секции не приходят от API и потому здесь отсутствуют,
 * а не показываются заблокированными (ТЗ 8).
 */
export function ProjectSections({ project, sections = {} }: IProps) {
  const detail = isDetailed(project) ? project : null;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{project.name}</h1>

      <nav className="flex gap-3">
        {sections[Section.Infrastructure] && (
          <Link href={`/projects/${project.id}/infrastructure`} className="underline">
            Инфраструктура
          </Link>
        )}
        {sections[Section.Variables] && (
          <Link href={`/projects/${project.id}/variables`} className="underline">
            Переменные
          </Link>
        )}
        {sections[Section.Roadmap] && (
          <Link href={`/projects/${project.id}/roadmap`} className="underline">
            Роадмап
          </Link>
        )}
        {sections[Section.Chronicle] && (
          <Link href={`/projects/${project.id}/chronicle`} className="underline">
            Хроника
          </Link>
        )}
      </nav>

      {detail ? (
        <dl className="grid gap-3">
          {detail.purpose && <Field label={FIELD_LABELS.purpose} value={detail.purpose} />}
          {detail.stack && <Field label={FIELD_LABELS.stack} value={detail.stack} />}
          {detail.repoUrl && (
            <div>
              <dt className="text-sm text-muted-foreground">{FIELD_LABELS.repoUrl}</dt>
              <dd>
                <a href={detail.repoUrl} className="underline">
                  {detail.repoUrl}
                </a>
              </dd>
            </div>
          )}
          {detail.notes && <Field label={FIELD_LABELS.notes} value={detail.notes} />}
        </dl>
      ) : (
        <p className="text-muted-foreground">
          Вам виден список проектов, но содержимое скрыто. Полный доступ выдаёт администратор.
        </p>
      )}
    </section>
  );
}

/** Одно поле паспорта. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Отличает полную проекцию от проекции метаданных. */
function isDetailed(project: ProjectMetadata | ProjectDetail): project is ProjectDetail {
  return 'purpose' in project;
}
