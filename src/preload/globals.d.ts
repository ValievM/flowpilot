import type { FlowPilotApi } from '../shared/flowpilot-api';

declare global {
  interface Window {
    flowpilot: FlowPilotApi;
  }
}
