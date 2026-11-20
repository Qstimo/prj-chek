'use client';

import type { ModelAuthScheme } from '@cairn/shared';

import { TextField } from '../TextField';
import { AUTH_SCHEME_OPTIONS, FOLDER_HINTS } from './constants';
import { SelectField } from './SelectField';
import type { INodeFieldsProps } from './types';

/**
 * Поля самого узла: адрес, схема авторизации, модель и каталог.
 *
 * Четыре поля вместе, потому что меняются вместе: смена провайдера
 * переписывает их все и не касается ни одного предела (дизайн, 7.2).
 *
 * Подсказка у модели приходит от пресета и говорит **форму** имени, а не
 * само имя: подставленное имя выглядело бы настроенным и отвечало бы
 * `400`.
 */
export function NodeFields({ values, onChange, kind, modelHint }: INodeFieldsProps) {
  return (
    <>
      <TextField
        id="baseUrl"
        label="Адрес"
        value={values.baseUrl}
        onChange={(value) => onChange('baseUrl', value)}
      />

      <SelectField
        id="authScheme"
        label="Схема авторизации"
        value={values.authScheme}
        onChange={(value) => onChange('authScheme', value as ModelAuthScheme)}
        options={AUTH_SCHEME_OPTIONS}
      />

      <div className="space-y-1">
        <TextField
          id="model"
          label="Модель"
          value={values.model}
          onChange={(value) => onChange('model', value)}
        />
        {modelHint && <p className="text-sm text-muted-foreground">{modelHint}</p>}
      </div>

      <div className="space-y-1">
        <TextField
          id="folder"
          label="Каталог"
          value={values.folder}
          onChange={(value) => onChange('folder', value)}
        />
        <p className="text-sm text-muted-foreground">{FOLDER_HINTS[kind]}</p>
      </div>
    </>
  );
}
