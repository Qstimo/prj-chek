import styles from './WhatsNewScreen.module.css';

const updates = [
  {
    title: 'Саммари',
    description: 'Созвон превращается в саммари и черновик задач.',
    hint: 'Как пользоваться: загрузите запись созвона на экране «Саммари» — текст и задачи появятся сами.',
  },
  {
    title: 'Выгрузка задач в Weeek',
    description: 'Задачи уезжают на доску одним действием.',
    hint: 'Как пользоваться: откройте вкладку «Задачи», отметьте нужные строки и нажмите «Выгрузить выбранные».',
  },
  {
    title: 'Загрузка из Weeek',
    description: 'Можно выбрать задачи с доски и принести их в проект.',
    hint: 'Как пользоваться: на вкладке «Задачи» нажмите «Подтянуть из Weeek» и выберите нужные задачи.',
  },
  {
    title: 'Автовыполнение в релизе',
    description: 'Обновление статуса в Weeek закрывает задачу в релизе.',
    hint: 'Как пользоваться: задайте колонку завершения в настройках задач — попадание в неё закроет задачу в релизе.',
  },
] as const;

export function WhatsNewScreen() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {updates.map((update, index) => (
        <article
          key={update.title}
          className={`${styles.card} relative overflow-hidden rounded-lg border border-border bg-surface p-6`}
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <h2 className="text-lg font-semibold">{update.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{update.description}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{update.hint}</p>
        </article>
      ))}
    </div>
  );
}
