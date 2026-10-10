import { useMemo, useState } from 'react';
import { sampleOffice } from '../data/sampleOffice';
import { moduleRegistry } from '../modules/registry';
import { analyzeOffice } from '../engine/analyzeOffice';
import { Scene } from '../scene/Scene';
import { ModuleSelector } from './ModuleSelector';
import { ViewToggle } from './ViewToggle';
import { BillOfMaterials } from './BillOfMaterials';
import './App.css';

function App() {
  const [selectedModuleId, setSelectedModuleId] = useState('blindLowVision');
  const [showFixes, setShowFixes] = useState(false);

  const officeData = sampleOffice;
  const modules = Object.values(moduleRegistry);
  const selectedModule = moduleRegistry[selectedModuleId];

  const issues = useMemo(
    () => analyzeOffice(officeData, selectedModule),
    [officeData, selectedModule]
  );

  const fixes = useMemo(
    () => issues.flatMap((issue) => selectedModule.fixesFor(issue)),
    [issues, selectedModule]
  );

  return (
    <div className="app">
      <div className="scene-panel">
        <Scene officeData={officeData} fixes={fixes} showFixes={showFixes} />
      </div>
      <div className="sidebar">
        <h1>Accessible Workplace Twin</h1>
        <ModuleSelector
          modules={modules}
          selectedModuleId={selectedModuleId}
          onChange={setSelectedModuleId}
        />
        <ViewToggle showFixes={showFixes} onChange={setShowFixes} />
        <BillOfMaterials issues={issues} fixes={fixes} />
      </div>
    </div>
  );
}

export default App;
