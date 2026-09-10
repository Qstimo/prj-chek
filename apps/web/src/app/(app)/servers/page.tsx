import Link from 'next/link';

import { ServersScreen } from './ServersScreen';

/** Страница реестра серверов. */
export default function ServersPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Серверы</h1>
        <div className="flex gap-3">
          <Link href="/servers/map" className="rounded-md border border-border px-3 py-2 text-sm">
            Карта размещения
          </Link>
          <Link
            href="/servers/new"
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Добавить сервер
          </Link>
        </div>
      </div>
      <ServersScreen />
    </main>
  );
}
