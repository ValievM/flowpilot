import { describe, expect, it } from 'vitest';
import { OFFLINE_EVALUATION_CASES } from './evaluation-cases';
import {
  parseAnswerCreateCards,
  parseAnswerNow,
  parseAnswerReplan,
  parseAnswerRuleEdit,
} from './parse-answer';
import type { ParseAnswerResult } from './answer-types';

describe('offline AI answer evaluation', () => {
  it('matches every recorded fictional case without network access', () => {
    const rows = OFFLINE_EVALUATION_CASES.map((evaluationCase) => {
      const result = evaluate(evaluationCase);
      const actual = result.ok;
      return {
        case: evaluationCase.name,
        expected: evaluationCase.expectedValid ? 'accept' : 'reject',
        actual: actual ? 'accept' : 'reject',
        pass: actual === evaluationCase.expectedValid,
      };
    });
    console.table(rows);
    expect(rows).toHaveLength(16);
    expect(rows.every((row) => row.pass)).toBe(true);
  });
});

function evaluate(
  evaluationCase: (typeof OFFLINE_EVALUATION_CASES)[number],
): ParseAnswerResult<unknown> {
  switch (evaluationCase.answerKind) {
    case 'now':
      return parseAnswerNow(evaluationCase.response, evaluationCase.context);
    case 'createCards':
      return parseAnswerCreateCards(evaluationCase.response);
    case 'replan':
      return parseAnswerReplan(evaluationCase.response, evaluationCase.context);
    case 'ruleEdit':
      return parseAnswerRuleEdit(
        evaluationCase.response,
        evaluationCase.context,
      );
  }
}
