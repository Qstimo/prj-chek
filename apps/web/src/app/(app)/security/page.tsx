import { SecurityScreen } from './SecurityScreen';

/** Страница привязки второго фактора. */
export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Второй фактор</h1>
      <SecurityScreen />
    </main>
  );
}
