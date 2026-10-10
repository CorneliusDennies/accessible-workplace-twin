import type { AgentEvent, PlanResult } from '../planner/agent/types';
import type { ScanInfo } from './api';

export interface Turn {
  id: string;
  kind?: 'plan' | 'scan'; // 'scan' = a video upload turned into a 3D space
  request: string;
  scanId?: string; // which space a plan was designed for
  scan?: ScanInfo; // result of a 'scan' turn
  status: 'running' | 'done' | 'error';
  events: AgentEvent[];
  plan?: PlanResult;
  reply?: string; // agent answered in words (e.g. asked who the space is for)
  error?: string;
  startedAt: number;
  finishedAt?: number;
  fromSaved?: boolean; // replayed from /api/plan/last
  sample?: boolean; // UI preview fixture (?sample)
}

export interface Conversation {
  id: string;
  title: string;
  turns: Turn[];
  updatedAt: number;
}
