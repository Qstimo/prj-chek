import Link from 'next/link';

import { SummaryScreen } from './SummaryScreen';

/** Страница работы с одним саммари. */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <nav aria-label="Навигация" className="text-sm text-muted-foreground">
        <Link href="/summaries" className="hover:underline">
          Саммари
        </Link>
      </nav>

      <SummaryScreen summaryId={id} />
    </main>
  );
}
