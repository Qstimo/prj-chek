'use client';

/** Пропсы набранных адресов. */
interface IProps {
  value: string[];
  onRemove: (domain: string) => void;
}

/** Уже набранные адреса окружения: каждый со своим «×». */
export function SelectedDomains({ value, onRemove }: IProps) {
  if (value.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {value.map((domain) => (
        <li key={domain} className="flex items-center gap-2 rounded bg-muted px-2 py-1">
          <span className="text-sm">{domain}</span>
          <button
            type="button"
            aria-label={`Убрать ${domain}`}
            onClick={() => onRemove(domain)}
            className="text-sm text-muted-foreground"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
