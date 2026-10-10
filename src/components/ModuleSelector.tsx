import type { Module } from '../types';

interface ModuleSelectorProps {
  modules: Module[];
  selectedModuleId: string;
  onChange: (moduleId: string) => void;
}

export function ModuleSelector({ modules, selectedModuleId, onChange }: ModuleSelectorProps) {
  return (
    <div className="module-selector">
      <label htmlFor="module-select">Disability module</label>
      <select
        id="module-select"
        value={selectedModuleId}
        onChange={(e) => onChange(e.target.value)}
      >
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
