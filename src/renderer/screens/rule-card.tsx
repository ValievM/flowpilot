import React from 'react';
import type { IpcStoredRule } from '../../shared/rule-contracts';
import { useCatalog } from '../catalog/catalog-context';
import {
  currentDocument,
  diagnosticWordsFor,
  ruleCountText,
  ruleSentence,
  ruleTitle,
  statusText,
} from '../rules/rules-copy';
import type { RulesModel } from '../rules/use-rules';
import { RuleBindForm } from './rule-bind-form';

function Bindings({
  rule,
}: {
  readonly rule: IpcStoredRule;
}): React.JSX.Element {
  const { taskTypes, disciplines } = useCatalog();
  const scope = currentDocument(rule)?.scope;
  const types = (scope?.task_type_ids ?? []).flatMap(
    (id) => taskTypes.find((item) => item.id === id)?.name ?? [],
  );
  const subjects = (scope?.discipline_ids ?? []).flatMap(
    (id) => disciplines.find((item) => item.id === id)?.name ?? [],
  );
  return (
    <p className="rule-meta">
      {types.length > 0 ? types.join(', ') : 'нет привязки'} ·{' '}
      {subjects.length > 0 ? subjects.join(', ') : 'все дисциплины'} ·{' '}
      {ruleCountText(currentDocument(rule)?.rules.length ?? 0)}
    </p>
  );
}

function Details({
  rule,
}: {
  readonly rule: IpcStoredRule;
}): React.JSX.Element {
  const document = currentDocument(rule);
  return (
    <ul className="rule-details">
      {(document?.rules ?? []).map((item) => (
        <li key={item.id}>{ruleSentence(item)}</li>
      ))}
      {document?.guidance && <li>{document.guidance}</li>}
    </ul>
  );
}

function Diagnostics({
  rule,
  onBind,
  onResolve,
}: {
  readonly rule: IpcStoredRule;
  readonly onBind: () => void;
  readonly onResolve: () => void;
}): React.JSX.Element {
  return (
    <>
      {rule.diagnostics.map((item) => {
        const words = diagnosticWordsFor(item);
        return (
          <div
            key={`${item.code}-${item.path}`}
            className="rule-note"
            role="note"
            aria-label={`${words.title} · ${ruleTitle(rule)}`}
          >
            <strong>{words.title}</strong>
            <p>{words.text}</p>
            {item.action === 'bind' && (
              <button className="button" type="button" onClick={onBind}>
                Привязать
              </button>
            )}
            {item.action === 'resolve-conflict' && (
              <button className="button" type="button" onClick={onResolve}>
                Разрешить
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

export function RuleCard({
  rule,
  model,
}: {
  readonly rule: IpcStoredRule;
  readonly model: RulesModel;
}): React.JSX.Element {
  const title = ruleTitle(rule);
  const [open, setOpen] = React.useState(false);
  const [binding, setBinding] = React.useState(false);
  const [resolving, setResolving] = React.useState(false);
  return (
    <article className="rule-card" aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span className="rule-status">{statusText(rule)}</span>
      </header>
      <Bindings rule={rule} />
      <Diagnostics
        rule={rule}
        onBind={() => {
          setBinding(true);
        }}
        onResolve={() => {
          setResolving(true);
        }}
      />
      {resolving && (
        <div className="rule-note" role="group" aria-label="Разрешить конфликт">
          <p>Отключить «{title}», чтобы убрать конфликт?</p>
          <button
            className="button"
            type="button"
            onClick={() => {
              void model.deactivate(rule.id).then(() => {
                setResolving(false);
              });
            }}
          >
            Отключить документ
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setResolving(false);
            }}
          >
            Отмена
          </button>
        </div>
      )}
      {open && <Details rule={rule} />}
      {binding && (
        <RuleBindForm
          rule={rule}
          onSave={(scope) => model.bind(rule.id, scope)}
          onClose={() => {
            setBinding(false);
          }}
        />
      )}
      <div className="rule-actions">
        <button
          className="button"
          type="button"
          aria-expanded={open}
          aria-label={`Показать правила: ${title}`}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Скрыть правила' : 'Показать правила'}
        </button>
        <button
          className="button"
          type="button"
          aria-label={`Привязать: ${title}`}
          onClick={() => {
            setBinding(true);
          }}
        >
          Привязать
        </button>
        {rule.status === 'active' ? (
          <button
            className="button"
            type="button"
            aria-label={`Отключить: ${title}`}
            onClick={() => void model.deactivate(rule.id)}
          >
            Отключить
          </button>
        ) : (
          <button
            className="button button-primary"
            type="button"
            aria-label={`Активировать: ${title}`}
            onClick={() => void model.activate(rule.id)}
          >
            Активировать
          </button>
        )}
        {rule.activeDocument && (
          <button
            className="button"
            type="button"
            aria-label={`Экспортировать: ${title}`}
            onClick={() => void model.exportRule(rule.id)}
          >
            Экспортировать
          </button>
        )}
      </div>
    </article>
  );
}
