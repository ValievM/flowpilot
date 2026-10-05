import type { FlowPilotApi } from '../shared/contracts';

declare global {
  interface Window {
    flowpilot: FlowPilotApi;
  }
}
