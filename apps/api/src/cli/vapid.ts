import webpush from 'web-push';

/** Пара ключей VAPID. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Генерирует пару ключей для подписи пушей.
 *
 * Своей командой, а не сторонним инструментом: ключи нужны один раз при
 * развёртывании, и отправлять человека за ними в чужой пакет значило бы
 * сделать обязательный шаг развёртывания необязательно сложным.
 */
export function generateVapidKeys(): VapidKeys {
  return webpush.generateVAPIDKeys();
}

/** Печатает пару готовыми строками окружения. */
export function formatVapidKeys(keys: VapidKeys): string {
  return [
    'Ключи уведомлений. Приватный — секрет: храни вне базы, рядом с ключом шифрования.',
    '',
    `CAIRN_VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `CAIRN_VAPID_PRIVATE_KEY=${keys.privateKey}`,
    'CAIRN_VAPID_SUBJECT=mailto:admin@example.com',
    '',
    'Без всех трёх переменных уведомления выключены.',
    '',
  ].join('\n');
}
