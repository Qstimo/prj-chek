import type { IProps } from './types';

/**
 * Предупреждения о сроках и авариях (ТЗ 8): именно это теряется первым,
 * когда проектов больше трёх. Пустой список не рисует ничего.
 */
export function WarningsPanel({ warnings }: IProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
      <h2 className="text-sm font-medium">Предупреждения</h2>
      <ul className="space-y-0.5 text-sm">
        {warnings.map((warning, index) => (
          <li key={`${warning.subject}-${warning.kind}-${index}`}>
            <span className="font-medium">{warning.subject}</span>: {warning.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
