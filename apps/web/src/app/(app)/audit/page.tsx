import { AuditScreen } from './AuditScreen';

/** Страница журнала действий. */
export default function AuditPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Журнал действий</h1>
      <AuditScreen />
    </main>
  );
}
