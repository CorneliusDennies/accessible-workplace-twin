import { useRef, useState } from 'react';
import { SCAN_API_BASE_URL } from '../config';

type ScanState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'processing'; serialize: string }
  | { phase: 'ready'; glbUrl: string }
  | { phase: 'error'; message: string };

interface ScanUploadProps {
  onScanReady: (glbUrl: string) => void;
}

const POLL_INTERVAL_MS = 5000;

export function ScanUpload({ onScanReady }: ScanUploadProps) {
  const [state, setState] = useState<ScanState>({ phase: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function pollStatus(serialize: string) {
    try {
      const statusRes = await fetch(`${SCAN_API_BASE_URL}/api/scan/${serialize}/status`);
      const statusBody = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusBody.error ?? 'Status check failed');

      if (statusBody.status === 'success') {
        const modelRes = await fetch(`${SCAN_API_BASE_URL}/api/scan/${serialize}/model`);
        const modelBody = await modelRes.json();
        if (!modelRes.ok) throw new Error(modelBody.error ?? 'Model fetch failed');
        const glbUrl = `${SCAN_API_BASE_URL}${modelBody.modelUrl}`;
        setState({ phase: 'ready', glbUrl });
        onScanReady(glbUrl);
        return;
      }

      if (statusBody.status === 'failed' || statusBody.status === 'expired') {
        setState({ phase: 'error', message: `Reconstruction ${statusBody.status}. Try a different video.` });
        return;
      }

      setTimeout(() => pollStatus(serialize), POLL_INTERVAL_MS);
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Status check failed' });
    }
  }

  async function handleFileSelected(file: File) {
    setState({ phase: 'uploading' });
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetch(`${SCAN_API_BASE_URL}/api/scan`, { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Upload failed');

      setState({ phase: 'processing', serialize: body.serialize });
      pollStatus(body.serialize);
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Could not reach the scan server',
      });
    }
  }

  return (
    <div className="scan-upload">
      <h2>Scan your office</h2>
      <p className="scan-hint">
        Walk slowly around your space on video, covering each corner, then upload it here. Reconstruction
        can take up to ~30 minutes.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      {state.phase === 'idle' && (
        <button onClick={() => fileInputRef.current?.click()}>Upload walkthrough video</button>
      )}
      {state.phase === 'uploading' && <p>Uploading and extracting frames...</p>}
      {state.phase === 'processing' && <p>Reconstructing your space... this page will update automatically.</p>}
      {state.phase === 'ready' && (
        <>
          <p>Scan ready — switched the 3D view to your space.</p>
          <button onClick={() => fileInputRef.current?.click()}>Scan again</button>
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
