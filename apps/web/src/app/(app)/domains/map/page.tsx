import Link from 'next/link';

import { DomainMapScreen } from './DomainMapScreen';

/** Страница карты доменов. */
export default function DomainMapPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Карта доменов</h1>
        <Link href="/domains" className="rounded-md border border-border px-3 py-2 text-sm">
          К реестру доменов
        </Link>
      </div>
      <DomainMapScreen />
    </main>
  );
}
