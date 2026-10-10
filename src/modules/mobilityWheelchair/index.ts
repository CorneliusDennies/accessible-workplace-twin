import type { Module } from '../../types';
import { analyze } from './rules';
import { fixesFor } from './fixes';

export const mobilityWheelchair: Module = {
  id: 'mobilityWheelchair',
  name: 'Mobility / Wheelchair',
  analyze,
  fixesFor,
};
