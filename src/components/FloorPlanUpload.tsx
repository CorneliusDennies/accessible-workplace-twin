import { useRef, useState } from 'react';
import { SCAN_API_BASE_URL } from '../config';
import type { OfficeData } from '../types';

type ParseState =
  | { phase: 'idle' }
  | { phase: 'parsing' }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

interface FloorPlanUploadProps {
  onParsed: (officeData: OfficeData) => void;
}

export function FloorPlanUpload({ onParsed }: FloorPlanUploadProps) {
  const [state, setState] = useState<ParseState>({ phase: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File) {
    setState({ phase: 'parsing' });
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${SCAN_API_BASE_URL}/api/floorplan`, { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Floor plan parsing failed');

      onParsed(body.officeData as OfficeData);
      setState({ phase: 'done' });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Could not reach the server',
      });
    }
  }

  return (
    <div className="scan-upload">
      <h2>Import a floor plan</h2>
      <p className="scan-hint">
        Upload a photo or scan of an existing floor plan — AI reads it and builds an editable layout you can
        review before applying.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      {state.phase === 'idle' && (
        <button onClick={() => fileInputRef.current?.click()}>Upload floor plan image</button>
      )}
      {state.phase === 'parsing' && <p>Reading the floor plan...</p>}
      {state.phase === 'done' && (
        <>
          <p>Imported — opened in the layout editor for review.</p>
          <button onClick={() => fileInputRef.current?.click()}>Import another</button>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <p className="scan-error">{state.message}</p>
          <button onClick={() => fileInputRef.current?.click()}>Try again</button>
        </>
      )}
    </div>
  );
}
