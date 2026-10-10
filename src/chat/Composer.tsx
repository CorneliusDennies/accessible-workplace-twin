import { useEffect, useRef, useState } from 'react';
import type { ScanInfo } from './api';
import { IconArrowUp, IconBuilding, IconCheck, IconChevronDown, IconPaperclip, IconStop, IconVideo } from './icons';

interface ComposerProps {
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach: (file: File) => void;
  scans: ScanInfo[];
  activeScan: ScanInfo | null;
  onPickScan: (id: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}

export function Composer({ running, onSend, onStop, onAttach, scans, activeScan, onPickScan, placeholder, autoFocus }: ComposerProps) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Grow with content up to ~8 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  // Close the space menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const send = () => {
    const t = text.trim();
    if (!t || running) return;
    onSend(t);
    setText('');
  };

  const pickFile = () => {
    setMenuOpen(false);
    fileRef.current?.click();
  };

  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={text}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onAttach(file);
        }}
      />
      <div className="composer-row">
        <div className="composer-tools">
          <button className="attach-btn" onClick={pickFile} disabled={running} title="Upload a walkthrough video" aria-label="Upload a walkthrough video">
            <IconPaperclip size={18} />
          </button>

          <div className="space-menu" ref={menuRef}>
            <button className="office-chip" onClick={() => setMenuOpen((o) => !o)} disabled={running} aria-haspopup="menu" aria-expanded={menuOpen}>
              <IconBuilding size={15} />
              {activeScan ? `${activeScan.name} · ${activeScan.room.width} × ${activeScan.room.depth} m` : 'Choose a space'}
              <IconChevronDown size={14} />
            </button>
            {menuOpen && (
              <div className="space-list" role="menu">
                <div className="space-list-label">Design for</div>
                {scans.map((s) => (
                  <button
                    key={s.id}
                    role="menuitem"
                    className={s.id === activeScan?.id ? 'on' : ''}
                    onClick={() => {
                      onPickScan(s.id);
                      setMenuOpen(false);
                    }}
                  >
                    <IconBuilding size={15} />
                    <span>
                      <strong>{s.name}</strong>
                      <em>
                        {s.room.width} × {s.room.depth} m{s.rooms.length ? ` · ${s.rooms.length} rooms` : ''}
                      </em>
                    </span>
                    {s.id === activeScan?.id && <IconCheck size={15} />}
                  </button>
                ))}
                <button role="menuitem" className="space-upload" onClick={pickFile}>
                  <IconVideo size={15} />
                  <span>
                    <strong>Upload a walkthrough video</strong>
                    <em>Builds a 3D model of your space</em>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {running ? (
          <button className="send-btn" onClick={onStop} aria-label="Stop">
            <IconStop size={16} />
          </button>
        ) : (
          <button className="send-btn" onClick={send} disabled={!text.trim()} aria-label="Send">
            <IconArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
