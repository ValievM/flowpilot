module.exports = {
  forbidden: [
    {
      name: 'storage-no-ui-or-electron',
      severity: 'error',
      from: { path: '^src/storage' },
      to: {
        path: '^src/(renderer|main|preload)(/|$)|^node_modules/electron(/|$)',
      },
    },
    {
      name: 'preload-no-internal-implementation',
      severity: 'error',
      from: { path: '^src/preload' },
      to: { path: '^src/(storage|main|renderer|domain)(/|$)' },
    },
    {
      name: 'shared-only-self-and-zod',
      severity: 'error',
      from: { path: '^src/shared' },
      to: {
        pathNot: '^src/shared(/|$)',
        dependencyTypesNot: ['npm', 'npm-dev'],
      },
    },
    {
      name: 'shared-only-zod-package',
      severity: 'error',
      from: { path: '^src/shared' },
      to: {
        dependencyTypes: ['npm', 'npm-dev'],
        pathNot: '^node_modules/zod(/|$)',
      },
    },
    {
      name: 'renderer-no-node-or-electron',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: {
        path: '^(node_modules/electron(/|$)|node:|fs$|path$)',
      },
    },
    {
      name: 'renderer-no-node-core-modules',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-god-names',
      severity: 'error',
      from: {},
      to: {
        path: '^src/.*(?:/|^)(utils|helpers|common|manager|misc)(/|\\.|$)',
      },
    },
    {
      name: 'domain-is-independent',
      severity: 'error',
      from: { path: '^src/domain', pathNot: '\\.test\\.ts$' },
      to: { pathNot: '^src/domain', dependencyTypesNot: ['npm'] },
    },
    {
      name: 'domain-only-approved-packages',
      severity: 'error',
      from: { path: '^src/domain', pathNot: '\\.test\\.ts$' },
      to: {
        dependencyTypes: ['npm'],
        pathNot: '^(node_modules/)?(temporal-polyfill|zod)(/|$)',
      },
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
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
  },
};
