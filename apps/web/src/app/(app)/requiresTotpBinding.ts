/** Достаточная для решения часть ответа `/auth/me`. */
interface ISubjectFactors {
  isSuperadmin: boolean;
  isTotpEnabled: boolean;
}

/**
 * Обязан ли субъект привязать второй фактор прежде остальных экранов.
 *
 * Спека 6.4: суперадмин без фактора видит единственный экран `/security`.
 * Флаг `CAIRN_ALLOW_INSECURE_NO_TOTP=1` снимает требование — осознанное
 * ослабление для локальных стендов; на боевом развёртывании недопустим.
 */
export function requiresTotpBinding(
  subject: ISubjectFactors,
  isInsecureNoTotpAllowed: boolean,
): boolean {
  if (isInsecureNoTotpAllowed) {
    return false;
  }

  return subject.isSuperadmin && !subject.isTotpEnabled;
}
