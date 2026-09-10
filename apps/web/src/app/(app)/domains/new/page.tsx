import { NewDomainScreen } from './NewDomainScreen';

/** Страница добавления корневого домена. */
export default function NewDomainPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Новый домен</h1>
      <NewDomainScreen />
    </main>
  );
}
