import React from 'react';
import { useCatalog } from '../catalog/catalog-context';
import { currentDocument, issueText } from '../rules/rules-copy';
import { useRules, type RulesModel } from '../rules/use-rules';
import { RuleCard } from './rule-card';

function Message({
  model,
}: {
  readonly model: RulesModel;
}): React.JSX.Element | null {
  const { message } = model;
  if (!message) return null;
  if (message.kind === 'info') return <p role="status">{message.text}</p>;
  return (
    <div role="alert" className="rules-error">
      <p>{message.text}</p>
      <ul>
        {message.issues.map((issue) => (
          <li key={`${issue.path}-${issue.code}`}>{issueText(issue)}</li>
        ))}
      </ul>
    </div>
  );
}

function attentionCount(model: RulesModel): number {
  return model.rules.reduce((sum, rule) => sum + rule.diagnostics.length, 0);
}

export function RulesScreen(): React.JSX.Element {
  const model = useRules();
  const { taskTypes } = useCatalog();
  const uncovered = taskTypes.filter(
    ({ id }) =>
      !model.rules.some((rule) =>
        currentDocument(rule)?.scope.task_type_ids.includes(id),
      ),
  );
  const attention = attentionCount(model);
  return (
    <section className="rules-screen" aria-labelledby="rules-heading">
      <h1 id="rules-heading">Документы правил</h1>
      <div className="rules-toolbar">
        <button
          className="button"
          type="button"
          onClick={() => void model.importFile()}
        >
          Импортировать файл
        </button>
        {attention > 0 && (
          <span
            className="rules-attention"
            role="status"
            aria-label="Требует внимания"
          >
            {attention}
          </span>
        )}
      </div>
      <Message model={model} />
      {model.loaded && model.rules.length === 0 && (
        <p className="rules-empty">
          Правил пока нет. Без правил карточки видны как обычно, без выдуманного
          обоснования порядка. Импортируйте файл правил, когда он понадобится.
        </p>
      )}
      {model.rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} model={model} />
      ))}
      {uncovered.length > 0 && model.rules.length > 0 && (
        <p className="rules-uncovered">
          Типы без правил: {uncovered.map(({ name }) => name).join(', ')}. Это
          не ошибка: такие задачи показываются без правил.
        </p>
      )}
    </section>
  );
}
