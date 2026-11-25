import { TasksScreen } from '../roadmap/tasks/TasksScreen';

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="space-y-6 pb-6">
      <h1 className="text-2xl font-semibold">Задачи</h1>
      <TasksScreen projectId={id} />
    </main>
  );
}
