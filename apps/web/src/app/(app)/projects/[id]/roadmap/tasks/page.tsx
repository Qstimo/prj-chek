import { TASKS_TEXTS } from './constants';
import { TasksScreen } from './TasksScreen';

/**
 * Страница реестра задач проекта.
 *
 * Адрес вложен в роадмап намеренно: право на задачу — право на «Роадмап»,
 * а состав разделов проекта закрыт секциями, и своего пункта навигации у
 * задач не появляется.
 */
export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="space-y-6 pb-6">
      <h1 className="text-2xl font-semibold">{TASKS_TEXTS.heading}</h1>
      <TasksScreen projectId={id} />
    </main>
  );
}
