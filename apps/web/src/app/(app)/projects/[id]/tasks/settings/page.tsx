import Link from 'next/link';
import { TrackerBindingPanel } from '../../roadmap/TrackerBindingPanel';

export default async function TaskSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="space-y-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Настройки задач</h1>
        <Link href={`/projects/${id}/tasks`} className="text-sm underline">
          К задачам
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Проект работает с одной доской Weeek. Здесь выбираются доска и колонка для создания новых
        задач.
      </p>
      <TrackerBindingPanel projectId={id} />
    </main>
  );
}
