import type { Module } from '../types';
import { blindLowVision } from './blindLowVision';

export const moduleRegistry: Record<string, Module> = {
  blindLowVision,
};
