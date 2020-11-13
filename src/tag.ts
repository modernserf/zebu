import { lang, ZebuLanguageReturning } from './lang';

type Field =
  | { type: 'field'; field: string }
  | { type: 'fieldWithValue'; field: string; value: unknown }
  | { type: 'skip' };

const parse = (type: string, fields: Field[]) => (...results: unknown[]) => {
  const obj: any = { type };
  for (const [i, field] of fields.entries()) {
    switch (field.type) {
      case 'skip':
        break;
      case 'field':
        obj[field.field] = results[i];
        break;
      case 'fieldWithValue':
        obj[field.field] = field.value;
        break;
    }
  }

  return obj;
};

type TagFn = (
  ...xs: unknown[]
) => {
  type: 'string';
  [key: string]: unknown;
};

export const tag = lang`
  Main = TagType Field* : ${parse};
  TagType = identifier;
  Field = Key AndValue?   
          : ${(field, andValue) =>
            andValue
              ? { type: 'fieldWithValue', field, value: andValue.value }
              : { type: 'field', field }}
        | "_" : ${() => ({ type: 'skip' })};
  Key = identifier | value;
  AndValue = "=" value : ${(_, value) => ({ value })};
` as ZebuLanguageReturning<TagFn>;
