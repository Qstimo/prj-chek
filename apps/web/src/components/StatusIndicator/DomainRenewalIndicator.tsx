import { StatusIndicator as Indicator } from '@cairn/shared';

import { StatusIndicator } from './StatusIndicator';

/** В реестре доменов индикатор описывает срок продления, а не живость сайта. */
export function DomainRenewalIndicator({ indicator }: { indicator: Indicator }) {
  const unknown = indicator === Indicator.Unknown;
  return (
    <StatusIndicator
      indicator={indicator}
      label={unknown ? 'Срок продления неизвестен' : undefined}
      title={unknown
        ? 'Дата продления не указана. Доступность сайта проверяется отдельно по адресам в инфраструктуре проекта.'
        : 'Статус срока продления домена; доступность сайта проверяется в инфраструктуре проекта.'}
    />
  );
}
