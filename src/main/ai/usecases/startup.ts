import { buildContext } from '../../../domain';
import { createAiReferenceIndex } from '../../../shared/ai-reference-index';
import { AiProposalApplication } from '../../ai-proposal-application';
import type { Clock, Repository, Snapshot } from '../../../storage';
import type { AiRunner } from '../ai-runner';
import { AiUseCases } from './scenario-usecases';
import type { AiReferenceData } from '../../ai-proposal-application';

export function createAiUseCases(
  repository: Repository,
  runner: AiRunner,
  clock: Clock,
): AiUseCases {
  const getReferenceData = (snapshot: Snapshot): AiReferenceData => ({
    ruleVersions: Object.fromEntries(
      snapshot.rules.map(({ id, version }) => [id, String(version)]),
    ),
    taskTypes: snapshot.taskTypes,
    disciplines: snapshot.disciplines,
    rules: snapshot.rules.flatMap(({ activeDocument }) =>
      activeDocument ? [activeDocument] : [],
    ),
  });
  return new AiUseCases({
    runner,
    repository,
    application: new AiProposalApplication(repository, () =>
      getReferenceData(repository.load()),
    ),
    getContext: (snapshot) => {
      const now = clock.now().toZonedDateTimeISO('UTC');
      return buildContext({
        today: now.toPlainDate(),
        now,
        tasks: snapshot.tasks,
        series: [],
        outcomes: [],
        activeRules: getReferenceData(snapshot).rules,
        taskTypes: snapshot.taskTypes,
        disciplines: snapshot.disciplines,
        workdays: new Set([1, 2, 3, 4, 5]),
        columns: snapshot.columns,
      });
    },
    getReferenceIndex: createAiReferenceIndex,
    getReferenceData,
    clock,
  });
}
