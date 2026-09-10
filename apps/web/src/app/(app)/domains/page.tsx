import Link from 'next/link';

import { DomainsScreen } from './DomainsScreen';

/** Страница реестра доменов. */
export default function DomainsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Домены</h1>
        <div className="flex gap-3">
          <Link href="/domains/map" className="rounded-md border border-border px-3 py-2 text-sm">
            Карта доменов
          </Link>
          <Link
            href="/domains/new"
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Добавить домен
          </Link>
        </div>
      </div>
      <DomainsScreen />
    </main>
  );
}
