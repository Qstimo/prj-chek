import { SummariesScreen } from './SummariesScreen';

/**
 * Страница потока саммари.
 *
 * В группе `(app)`, чтобы сработали проверка сессии и привязки второго
 * фактора из `(app)/layout.tsx`.
 */
export default function SummariesPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Саммари</h1>
      <SummariesScreen />
    </main>
  );
}
