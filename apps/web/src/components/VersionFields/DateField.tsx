'use client';

/** Пропсы поля даты. */
interface IProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** Поле даты-дня с подписью. */
export function DateField({ id, label, value, onChange }: IProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border px-3 py-2"
      />
    </div>
  );
}
