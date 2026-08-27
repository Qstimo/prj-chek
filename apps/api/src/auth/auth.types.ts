/**
 * Итог проверки пароля.
 *
 * Размеченное объединение, а не необязательные поля: вызывающий код обязан
 * различить сессию и челлендж, и типы должны его к этому принуждать.
 */
export type LoginOutcome =
  | { kind: 'session'; token: string }
  | { kind: 'totp_required'; challengeToken: string };
