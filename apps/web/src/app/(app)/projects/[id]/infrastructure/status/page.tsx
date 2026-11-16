import { Section, type CurrentSubjectResponse, type SectionLevels } from '@cairn/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { InfrastructureStatusPanel } from '../InfrastructureStatusPanel';

/** A detail screen of Infrastructure; it uses the existing section grant. */
export default async function InfrastructureStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let subject: CurrentSubjectResponse;
  try {
    const [current, sections] = await Promise.all([
      apiServer<CurrentSubjectResponse>('/auth/me'),
      apiServer<SectionLevels>(`/projects/${id}/sections`),
    ]);
    if (sections[Section.Infrastructure] === undefined) notFound();
    subject = current;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect('/login');
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) notFound();
    throw cause;
  }
  return <main className="space-y-6 pb-8">
    <Link href={`/projects/${id}/infrastructure`} className="inline-block text-sm text-muted-foreground hover:text-foreground">← Инфраструктура</Link>
    <header><h1 className="text-2xl font-semibold">Статус инфраструктуры</h1><p className="mt-2 text-sm text-muted-foreground">Текущее состояние адресов и зарегистрированные инциденты</p></header>
    <InfrastructureStatusPanel projectId={id} isSuperadmin={subject.isSuperadmin} />
  </main>;
}
