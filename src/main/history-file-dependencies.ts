import type { Clock, Repository } from '../storage';

export type HistoryFileDialogs = {
  pickFile(): Promise<string | undefined>;
  pickFolder(): Promise<string | undefined>;
};

export type RepositorySlot = {
  current(): Repository;
  replace(repository: Repository): void;
};

export type HistoryFileDependencies = {
  dialogs: HistoryFileDialogs;
  repositories: RepositorySlot;
  shell: { open(path: string): Promise<string> };
  profilePath: string;
  clock: Clock;
  makeToken?: () => string;
};
