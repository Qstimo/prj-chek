import { redirect } from 'next/navigation';

/** Старые закладки сохраняют фильтры после переезда. */
export default async function LegacyTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
  }
  redirect(`/projects/${id}/tasks${query.size ? `?${query}` : ''}`);
}
