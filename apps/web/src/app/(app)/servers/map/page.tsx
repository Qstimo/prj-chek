import Link from 'next/link';

import { ServerMapScreen } from './ServerMapScreen';

/** Страница карты размещения. */
export default function ServerMapPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Карта размещения</h1>
        <Link href="/servers" className="rounded-md border border-border px-3 py-2 text-sm">
          К реестру серверов
        </Link>
      </div>
      <ServerMapScreen />
    </main>
  );
}
