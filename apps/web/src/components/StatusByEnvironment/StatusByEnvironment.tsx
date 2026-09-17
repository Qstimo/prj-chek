import { AddressStatusLine } from './AddressStatusLine';
import type { IProps } from './types';

/**
 * Статус проекта адресами под их окружением (ТЗ 6).
 *
 * Два списка — окружения отдельно, домены отдельно — оставляли человеку
 * работу сводить их глазами. Здесь под каждым окружением идут его адреса,
 * и именно строка адреса отвечает на вопрос «что сломалось».
 */
export function StatusByEnvironment({ environments, addresses }: IProps) {
  return (
    <ul className="space-y-2 text-sm">
      {environments.map((environment) => {
        const own = addresses.filter(
          (address) => address.environmentId === environment.environmentId,
        );

        return (
          <li key={environment.environmentId} aria-label={environment.name}>
            <p className="font-medium">{environment.name}</p>

            {own.length === 0 ? (
              // Проверять нечем — значит, нечего и утверждать.
              <p className="text-muted-foreground">Нет адресов — проверять нечего</p>
            ) : (
              <ul className="space-y-0.5 pl-4">
                {own.map((address) => (
                  <li key={address.domainId} aria-label={address.name}>
                    <AddressStatusLine address={address} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
