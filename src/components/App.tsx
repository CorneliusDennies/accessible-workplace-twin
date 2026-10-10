import { useMemo, useState } from 'react';
import { sampleOffice } from '../data/sampleOffice';
import { moduleRegistry } from '../modules/registry';
import { analyzeOffice } from '../engine/analyzeOffice';
import type { OfficeData } from '../types';
import { Scene, type TagTool } from '../scene/Scene';
import { ModuleSelector } from './ModuleSelector';
import { ViewToggle } from './ViewToggle';
import { BillOfMaterials } from './BillOfMaterials';
import { ScanUpload } from './ScanUpload';
import { FloorPlanUpload } from './FloorPlanUpload';
import { RoomEditor } from './RoomEditor';
import { TagToolbar } from './TagToolbar';
import { SCAN_API_BASE_URL } from '../config';
import './App.css';

function makeTagId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function App() {
  const [selectedModuleId, setSelectedModuleId] = useState('blindLowVision');
  const [showFixes, setShowFixes] = useState(false);
  const [officeData, setOfficeData] = useState<OfficeData>(sampleOffice);
  const [editingLayout, setEditingLayout] = useState(false);
  const [pendingImport, setPendingImport] = useState<OfficeData | null>(null);
  const [tagTool, setTagTool] = useState<TagTool>(null);
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

  function handleTagPlaced(x: number, z: number) {
    if (!tagTool || tagTool === 'erase') return;

    if (tagTool === 'door') {
      setOfficeData((d) => ({
        ...d,
        doors: [...d.doors, { id: makeTagId('tag-door'), roomId: '', position: [x, 0, z], width: 1 }],
      }));
    } else if (tagTool === 'stairs') {
      setOfficeData((d) => ({
        ...d,
        stairs: [
          ...d.stairs,
          { id: makeTagId('tag-stairs'), position: [x, 0, z], size: [2, 0.5, 1.5], direction: 'down' },
        ],
      }));
    } else if (tagTool === 'obstacle') {
      setOfficeData((d) => ({
        ...d,
        obstacles: [
          ...d.obstacles,
          {
            id: makeTagId('tag-obstacle'),
            type: 'tagged-obstacle',
            position: [x, 0.75, z],
            size: [0.5, 1.5, 0.5],
            hazard: true,
          },
        ],
      }));
    }
  }

  function handleTagErased(kind: 'door' | 'obstacle' | 'stairs', id: string) {
    setOfficeData((d) => ({
      ...d,
      doors: kind === 'door' ? d.doors.filter((x) => x.id !== id) : d.doors,
      obstacles: kind === 'obstacle' ? d.obstacles.filter((x) => x.id !== id) : d.obstacles,
      stairs: kind === 'stairs' ? d.stairs.filter((x) => x.id !== id) : d.stairs,
    }));
  }

  return (
    <div className="app">
      <div className="scene-panel">
        {editingLayout ? (
          <RoomEditor
            initialOfficeData={pendingImport ?? officeData}
            onCancel={() => {
              setPendingImport(null);
              setEditingLayout(false);
            }}
            onApply={(data) => {
              setOfficeData(data);
              setScannedGlbUrl(null);
              setPendingImport(null);
              setEditingLayout(false);
            }}
          />
        ) : (
          <>
            <div className="scene-toolbar">
              <button onClick={() => setEditingLayout(true)}>Edit workplace layout</button>
              <TagToolbar tagTool={tagTool} onChange={setTagTool} />
            </div>
            <Scene
              officeData={officeData}
              fixes={fixes}
              showFixes={showFixes}
              scannedGlbUrl={scannedGlbUrl}
              tagTool={tagTool}
              onTagPlaced={handleTagPlaced}
              onTagErased={handleTagErased}
            />
          </>
        )}
      </div>
      <div className="sidebar">
        <h1>Accessible Workplace Twin</h1>
        <FloorPlanUpload
          onParsed={(data) => {
            setPendingImport(data);
            setEditingLayout(true);
          }}
        />
        <ScanUpload onScanReady={setScannedGlbUrl} />
        {scannedGlbUrl && (
          <p className="scan-note">
            Showing your scanned space. Use the tag tools above the 3D view to mark doors, stairs, and obstacles
            directly on the scan — tagged elements feed the issues/fixes below just like the editable layout.
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
