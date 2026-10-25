export type AiProviderStatus = {
  readonly provider: 'manual' | 'codex';
  readonly codex: { readonly installed: boolean; readonly loggedIn: boolean };
};
