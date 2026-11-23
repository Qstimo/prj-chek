import { ModelServicesScreen } from './ModelServicesScreen';
import { TrackerScreen } from './TrackerScreen';

/**
 * Страница настроек установки. Закрыта правом суперадмина на API — тем же
 * способом, которым закрыты «Серверы» и «Домены».
 *
 * Блоки со своими заголовками, а не один список карточек: службы модели и
 * трекер задач — разные перечни, разные ручки и разные решения, и
 * настроенная разбивка саммари не говорит ничего о выгрузке задач
 * (дизайн, 5.1 и 9.1).
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Службы модели</h2>
        <ModelServicesScreen />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Трекер задач</h2>
        <TrackerScreen />
      </section>
    </main>
  );
}
