import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { runtimeModuleNames, shouldIgnore } from './forge.runtime-modules';

const runtimeModules = runtimeModuleNames(__dirname);

const config: ForgeConfig = {
  packagerConfig: {
    // Native addons cannot be loaded from inside an asar archive.
    asar: { unpack: '**/*.node' },
    appBundleId: 'com.flowpilot.app',
    ignore: (file: string) => shouldIgnore(file, runtimeModules),
  },
  rebuildConfig: {},
  makers: [new MakerZIP({})],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
      hotRestart: true,
    }),
  ],
};

export default config;
