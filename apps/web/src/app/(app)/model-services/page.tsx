import { ModelServicesScreen } from './ModelServicesScreen';

/** Страница настройки служб модели. Закрыта правом суперадмина на API. */
export default function ModelServicesPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Службы модели</h1>
      <ModelServicesScreen />
    </main>
  );
}
