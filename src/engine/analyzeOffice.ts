import type { OfficeData, Module, Issue } from '../types';

export function analyzeOffice(officeData: OfficeData, module: Module): Issue[] {
  return module.analyze(officeData);
}
