import type { Module } from '../../types';
import { analyze } from './rules';
import { fixesFor } from './fixes';

export const blindLowVision: Module = {
  id: 'blindLowVision',
  name: 'Blind / Low Vision',
  analyze,
  fixesFor,
};
