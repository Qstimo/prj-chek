'use client';

/** Пропсы списка подсказок. */
interface IProps {
  /** Известные адреса, подходящие под набранное. */
  matches: string[];
  /** Набранное целиком: им заводится адрес, которого в реестре нет. */
  draft: string;
  /** Показывать строку «Создать»: набранного нет ни в списке, ни в наборе. */
  canCreate: boolean;
  onPick: (domain: string) => void;
}

/**
 * Подсказки известных адресов.
 *
 * Последняя строка — «Создать»: реестр не обязан знать адрес заранее,
 * и выбор из списка не должен превращаться в запрет на новое имя.
 */
export function DomainOptions({ matches, draft, canCreate, onPick }: IProps) {
  if (matches.length === 0 && !canCreate) {
    return null;
  }

  return (
    <ul role="listbox" aria-label="Известные адреса" className="rounded-md border border-border">
      {matches.map((domain) => (
        <li
          key={domain}
          role="option"
          aria-selected={false}
          onClick={() => onPick(domain)}
          className="cursor-pointer px-3 py-1 text-sm hover:bg-muted"
        >
          {domain}
        </li>
      ))}

      {canCreate && (
        <li
          role="option"
          aria-selected={false}
          onClick={() => onPick(draft)}
          className="cursor-pointer px-3 py-1 text-sm text-muted-foreground hover:bg-muted"
        >
          Создать: {draft}
        </li>
      )}
    </ul>
  );
}
