export const RULES_SCHEMA_V1 = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'id', 'title', 'scope', 'rules'],
  properties: {
    schema_version: { const: 'v1' },
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    scope: {
      type: 'object',
      additionalProperties: false,
      required: ['task_type_ids'],
      properties: {
        task_type_ids: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        discipline_ids: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
    rules: {
      type: 'array',
      minItems: 1,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'kind', 'level', 'reason'],
            properties: {
              id: { type: 'string', minLength: 1 },
              kind: { const: 'priority' },
              level: { enum: ['high', 'normal', 'low'] },
              reason: { type: 'string', minLength: 1 },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'kind',
              'mode',
              'days',
              'start',
              'end',
              'time_zone',
            ],
            properties: {
              id: { type: 'string', minLength: 1 },
              kind: { const: 'time_window' },
              mode: { enum: ['allowed', 'forbidden', 'preferred'] },
              days: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: {
                  enum: [
                    'monday',
                    'tuesday',
                    'wednesday',
                    'thursday',
                    'friday',
                    'saturday',
                    'sunday',
                  ],
                },
              },
              start: {
                type: 'string',
                pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$',
              },
              end: {
                type: 'string',
                pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$',
              },
              time_zone: { type: 'string', minLength: 1 },
            },
          },
        ],
      },
    },
    guidance: { type: 'string', minLength: 1 },
  },
} as const;
