import { useMemo, useState } from 'react';
import { sampleOffice } from '../data/sampleOffice';
import { moduleRegistry } from '../modules/registry';
import { analyzeOffice } from '../engine/analyzeOffice';
import type { OfficeData } from '../types';
import { Scene } from '../scene/Scene';
import { ModuleSelector } from './ModuleSelector';
import { ViewToggle } from './ViewToggle';
import { BillOfMaterials } from './BillOfMaterials';
import { ScanUpload } from './ScanUpload';
import { RoomEditor } from './RoomEditor';
import { SCAN_API_BASE_URL } from '../config';
import './App.css';

function App() {
  const [selectedModuleId, setSelectedModuleId] = useState('blindLowVision');
  const [showFixes, setShowFixes] = useState(false);
  const [officeData, setOfficeData] = useState<OfficeData>(sampleOffice);
  const [editingLayout, setEditingLayout] = useState(false);
  const [scannedGlbUrl, setScannedGlbUrl] = useState<string | null>(() => {
    const serialize = new URLSearchParams(window.location.search).get('scan');
    return serialize ? `${SCAN_API_BASE_URL}/models/${serialize}.glb` : null;
  });

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
        {editingLayout ? (
          <RoomEditor
            initialOfficeData={officeData}
            onCancel={() => setEditingLayout(false)}
            onApply={(data) => {
              setOfficeData(data);
              setScannedGlbUrl(null);
              setEditingLayout(false);
            }}
          />
        ) : (
          <>
            <div className="scene-toolbar">
              <button onClick={() => setEditingLayout(true)}>Edit workplace layout</button>
            </div>
            <Scene officeData={officeData} fixes={fixes} showFixes={showFixes} scannedGlbUrl={scannedGlbUrl} />
          </>
        )}
      </div>
      <div className="sidebar">
        <h1>Accessible Workplace Twin</h1>
        <ScanUpload onScanReady={setScannedGlbUrl} />
        {scannedGlbUrl && (
          <p className="scan-note">
            Showing your scanned space. Issues/fixes below are still computed from the editable layout data —
            scans aren't auto-tagged yet.
          </p>
        )}
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
