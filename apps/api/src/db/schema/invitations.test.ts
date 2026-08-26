import { InvitationKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { invitationKindEnum, invitations } from './invitations';

describe('ссылки на установку пароля', () => {
  it('перечисление вида ссылки совпадает с контрактом', () => {
    expect(invitationKindEnum.enumValues).toEqual(Object.values(InvitationKind));
  });

  it('не хранит адрес почты', () => {
    // Адрес живёт только в users — два места хранения разошлись бы (спека 4.6).
    expect('email' in invitations).toBe(false);
  });

  it('различает приглашение и сброс пароля', () => {
    expect(invitations.kind).toBeDefined();
  });
});
