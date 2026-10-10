import type { Module } from '../types';
import { blindLowVision } from './blindLowVision';
import { mobilityWheelchair } from './mobilityWheelchair';

export const moduleRegistry: Record<string, Module> = {
  blindLowVision,
  mobilityWheelchair,
};
