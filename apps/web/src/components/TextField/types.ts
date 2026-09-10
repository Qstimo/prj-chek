/** Пропсы поля ввода. */
export interface IProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Многострочное поле вместо однострочного. */
  multiline?: boolean;
  /** Тип поля. Игнорируется для многострочного. */
  type?: 'text' | 'email' | 'date';
}
