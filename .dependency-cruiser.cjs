module.exports = {
  forbidden: [
    {
      name: 'domain-is-independent',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { pathNot: '^src/domain', dependencyTypesNot: ['npm'] },
    },
    {
      name: 'domain-only-approved-packages',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { dependencyTypes: ['npm'], pathNot: '^(temporal-polyfill|zod)(/|$)' },
    },
    {
      name: 'renderer-no-main-or-storage',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: { path: '^src/(storage|main)(/|$)' },
    },
    {
      name: 'main-no-renderer',
      severity: 'error',
      from: { path: '^src/main' },
      to: { path: '^src/renderer(/|$)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] },
  },
};
