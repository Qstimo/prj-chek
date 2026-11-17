/**
 * Разборщик адресов для контракта.
 *
 * `tsconfig.base.json` даёт пакету только `lib: ES2023`, а `URL` живёт в
 * `DOM` и в типах Node. Контракт компилируется и для браузера, и для
 * сервера, и дописать ему `DOM` целиком значило бы впустить в пакет схем
 * `fetch`, `Response` и `document` — то есть открыть дверь, которой у
 * контракта быть не должно: он получает строку и возвращает строку.
 *
 * Поэтому объявлено ровно то, чем пользуется
 * {@link parseModelServiceBaseUrl}, и объявлено **узко намеренно**:
 * понадобится ещё одно свойство — его дописывают здесь, прочитав эту
 * причину. Сам `URL` есть и в браузере, и в Node с четырнадцатой версии,
 * так что объявление описывает существующее, а не обещает своё.
 *
 * Файл в `dist` не попадает (`tsc` для `.d.ts` на входе ничего не
 * эмитит), поэтому приложениям он своего `URL` не навязывает — у них свой
 * из `DOM` и `@types/node`.
 */
declare class URL {
  constructor(url: string);
  readonly protocol: string;
  readonly origin: string;
  readonly pathname: string;
  readonly hostname: string;
  readonly search: string;
  readonly hash: string;
  readonly username: string;
  readonly password: string;
}
