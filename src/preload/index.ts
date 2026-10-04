import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('flowPilot', Object.freeze({ appName: 'FlowPilot' }));
