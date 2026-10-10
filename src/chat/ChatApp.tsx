import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, Design, PlanResult } from '../planner/agent/types';
import { fetchLastPlan, listScans, replyTurn, streamPlan, toPriorTurn, uploadScan, type ScanInfo } from './api';
import { AssistantTurn } from './AssistantTurn';
import { Composer } from './Composer';
import { DesignPanel } from './DesignPanel';
import { EmptyState } from './EmptyState';
import { ScanPanel } from './ScanPanel';
import { IconChat, IconMenu, IconPlus, IconVideo } from './icons';
import type { Conversation, Turn } from './types';
import './chat.css';

const PRODUCT_NAME = 'Workplace Twin';
const STORAGE_KEY = 'workplace-twin.chats.v1';
const SCAN_KEY = 'workplace-twin.scan';

function loadScanId(): string {
  try {
    return localStorage.getItem(SCAN_KEY) ?? 'demo';
  } catch {
    return 'demo';
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

function loadChats(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const chats: Conversation[] = raw ? JSON.parse(raw) : [];
    // A turn still "running" after a reload lost its stream.
    return chats.map((c) => ({
      ...c,
      turns: c.turns.map((t) => (t.status === 'running' ? { ...t, status: 'error', error: 'Interrupted by a page reload.' } : t)),
    }));
  } catch {
    return [];
  }
}

function saveChats(chats: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.filter((c) => !c.turns.some((t) => t.sample)).slice(0, 30)));
  } catch {
    // storage full or blocked — chats just won't persist
  }
}

const titleFrom = (text: string) => {
  const name = text.match(/for ([A-Z][a-z]+)/)?.[1];
  const t = name ? `Designing for ${name}` : text;
  return t.length > 42 ? `${t.slice(0, 40)}…` : t;
};

interface OpenDesign {
  turnId: string;
  designId: Design['id'];
}

export function ChatApp() {
  const [chats, setChats] = useState<Conversation[]>(loadChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenDesign | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scans, setScans] = useState<ScanInfo[]>([]);
  const [scanId, setScanId] = useState(loadScanId);
  const [scanPreview, setScanPreview] = useState<ScanInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0); // dragenter/leave fire for every child; count to avoid flicker
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = chats.find((c) => c.id === activeId) ?? null;
  const running = chat?.turns.some((t) => t.status === 'running') ?? false;
  const openTurn = open && chat?.turns.find((t) => t.id === open.turnId);
  const activeScan = scans.find((s) => s.id === scanId) ?? scans[0] ?? null;

  useEffect(() => saveChats(chats), [chats]);

  const refreshScans = useCallback(() => listScans().then(setScans), []);
  // Retry until the API answers (it may still be starting when the page loads).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => refreshScans().catch(() => (timer = setTimeout(attempt, 3000)));
    attempt();
    return () => clearTimeout(timer);
  }, [refreshScans]);

  const pickScan = (id: string) => {
    setScanId(id);
    try {
      localStorage.setItem(SCAN_KEY, id);
    } catch {
      // per-viewer convenience only
    }
  };

  const updateTurn = useCallback((chatId: string, turnId: string, patch: (t: Turn) => Turn) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, updatedAt: Date.now(), turns: c.turns.map((t) => (t.id === turnId ? patch(t) : t)) } : c)),
    );
  }, []);

  // Keep the newest message in view while the agent streams.
  const lastTurn = chat?.turns[chat.turns.length - 1];
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.turns.length, lastTurn?.events.length, lastTurn?.status]);

  // Appends a turn to the open conversation (or starts one) and returns its id.
  const addTurn = useCallback(
    (turn: Turn, title: string): string => {
      if (!activeId) {
        const fresh: Conversation = { id: uid(), title, turns: [turn], updatedAt: Date.now() };
        setChats((prev) => [fresh, ...prev]);
        setActiveId(fresh.id);
        return fresh.id;
      }
      setChats((prev) => prev.map((c) => (c.id === activeId ? { ...c, updatedAt: Date.now(), turns: [...c.turns, turn] } : c)));
      return activeId;
    },
    [activeId],
  );

  const freshAbort = () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    return abort;
  };

  const send = useCallback(
    async (text: string) => {
      const space = activeScan?.id ?? 'demo';
      const turn: Turn = { id: uid(), kind: 'plan', request: text, scanId: space, status: 'running', events: [], startedAt: Date.now() };
      const history = (chat?.turns ?? [])
        .filter((t) => t.kind !== 'scan' && t.scanId === space && (t.plan || t.reply))
        .map((t) => (t.plan ? toPriorTurn(t.request, t.plan) : replyTurn(t.request, t.reply!)));
      const id = addTurn(turn, titleFrom(text));
      const abort = freshAbort();

      try {
        await streamPlan(
          text,
          space,
          history,
          {
            onEvent: (e) => updateTurn(id, turn.id, (t) => ({ ...t, events: [...t.events, e] })),
            onResult: (plan) => {
              updateTurn(id, turn.id, (t) => ({ ...t, status: 'done', plan, finishedAt: Date.now() }));
              setScanPreview(null);
              setOpen({ turnId: turn.id, designId: plan.designs[0].id });
            },
            onReply: (reply) => updateTurn(id, turn.id, (t) => ({ ...t, status: 'done', reply, finishedAt: Date.now() })),
          },
          abort.signal,
        );
      } catch (err) {
        const message = abort.signal.aborted ? 'Stopped.' : err instanceof Error ? err.message : 'Something went wrong.';
        updateTurn(id, turn.id, (t) => ({ ...t, status: 'error', error: message, finishedAt: Date.now() }));
      }
    },
    [activeScan, chat, addTurn, updateTurn],
  );

  // Video upload → Claude builds the floor plan + 3D model → it becomes the active space.
  const attach = useCallback(
    async (file: File) => {
      const turn: Turn = { id: uid(), kind: 'scan', request: `🎥 ${file.name}`, status: 'running', events: [], startedAt: Date.now() };
      const id = addTurn(turn, `Scan · ${file.name.replace(/\.[^.]+$/, '')}`.slice(0, 42));
      const abort = freshAbort();
      try {
        const scan = await uploadScan(file, (text) => updateTurn(id, turn.id, (t) => ({ ...t, events: [...t.events, { type: 'text', text }] })), abort.signal);
        updateTurn(id, turn.id, (t) => ({ ...t, status: 'done', scan, finishedAt: Date.now() }));
        await refreshScans().catch(() => {});
        pickScan(scan.id);
        setOpen(null);
        setScanPreview(scan);
      } catch (err) {
        const message = abort.signal.aborted ? 'Stopped.' : err instanceof Error ? err.message : 'Upload failed.';
        updateTurn(id, turn.id, (t) => ({ ...t, status: 'error', error: message, finishedAt: Date.now() }));
      }
    },
    [addTurn, updateTurn, refreshScans],
  );

  const stop = () => abortRef.current?.abort();

  // A file dropped outside the chat area would make the browser open it and leave the app.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  // Drag a walkthrough video anywhere onto the chat to upload it.
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = running ? 'none' : 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (running) return;
      const files = [...e.dataTransfer.files];
      const video = files.find((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name));
      if (video) attach(video);
      else if (files.length) alert('Drop a video file (mp4, mov, webm…) of your space.');
    },
  };

  const newChat = () => {
    if (running) stop();
    setActiveId(null);
    setOpen(null);
    setScanPreview(null);
    setSidebarOpen(false);
  };

  // Demo safety net: replay the last saved result without calling the model.
  const loadSaved = async () => {
    try {
      const plan = await fetchLastPlan();
      const turn: Turn = { id: uid(), request: plan.problem, status: 'done', events: [], plan, startedAt: Date.now(), finishedAt: Date.now(), fromSaved: true };
      const c: Conversation = { id: uid(), title: titleFrom(plan.problem), turns: [turn], updatedAt: Date.now() };
      setChats((prev) => [c, ...prev]);
      setActiveId(c.id);
      setOpen({ turnId: turn.id, designId: plan.designs[0].id });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not load the saved result.');
    }
  };

  // ?sample loads a fixture so the UI can be previewed without an API key.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('sample')) return;
    import('./sample/samplePlan.json').then(({ default: data }) => {
      const sample = data as unknown as PlanResult & { events: AgentEvent[] };
      const turn: Turn = { id: uid(), request: sample.problem, status: 'done', events: sample.events, plan: sample, startedAt: Date.now() - 41000, finishedAt: Date.now(), sample: true };
      const c: Conversation = { id: uid(), title: titleFrom(sample.problem), turns: [turn], updatedAt: Date.now() };
      setChats((prev) => [c, ...prev.filter((x) => !x.turns.some((t) => t.sample))]);
      setActiveId(c.id);
    });
  }, []);

  return (
    <div className={`chat-app ${openTurn?.plan || scanPreview ? 'with-panel' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          {PRODUCT_NAME}
        </div>
        <button className="new-chat" onClick={newChat}>
          <IconPlus size={16} /> New design
        </button>

        {chats.length > 0 && <div className="side-label">Recent</div>}
        <ul className="history">
          {chats.map((c) => (
            <li key={c.id}>
              <button
                className={c.id === activeId ? 'on' : ''}
                onClick={() => {
                  setActiveId(c.id);
                  setOpen(null);
                  setScanPreview(null);
                  setSidebarOpen(false);
                }}
              >
                <IconChat size={15} />
                <span>{c.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="side-foot">
          <button className="side-link" onClick={loadSaved}>
            Load last saved result
          </button>
          <a className="side-link" href="?planner">
            Open classic planner
          </a>
        </div>
      </nav>
      <div className="scrim" onClick={() => setSidebarOpen(false)} />

      <main className="main" {...dropHandlers}>
        {dragging && (
          <div className={`drop-overlay ${running ? 'busy' : ''}`}>
            <div className="drop-card">
              <span className="drop-icon">
                <IconVideo size={28} />
              </span>
              <strong>{running ? 'Wait for the current task to finish' : 'Drop your walkthrough video'}</strong>
              <span>{running ? 'Then drop it again.' : "I'll build a 3D model of your space from it"}</span>
            </div>
          </div>
        )}
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <IconMenu size={20} />
          </button>
          <span className="topbar-title">{chat?.title ?? 'New design'}</span>
          <span className="model-pill">Gemini</span>
        </header>

        {chat ? (
          <div className="thread" ref={scrollRef}>
            <div className="thread-inner">
              {chat.turns.map((t) => (
                <div key={t.id} className="turn">
                  <div className="msg msg-user">
                    <div className="bubble">{t.request}</div>
                  </div>
                  <AssistantTurn
                    turn={t}
                    activeDesignId={open?.turnId === t.id ? open.designId : null}
                    onOpenDesign={(designId) => {
                      setScanPreview(null);
                      setOpen({ turnId: t.id, designId });
                    }}
                    onOpenScan={(scan) => {
                      setOpen(null);
                      setScanPreview(scan);
                    }}
                    onUseScan={(scan) => pickScan(scan.id)}
                    activeScanId={activeScan?.id ?? null}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread thread-empty">
            <EmptyState onPick={send} />
          </div>
        )}

        <div className="composer-wrap">
          <Composer
            running={running}
            onSend={send}
            onStop={stop}
            onAttach={attach}
            scans={scans}
            activeScan={activeScan}
            onPickScan={pickScan}
            autoFocus
            placeholder={chat ? 'Ask for changes, e.g. "Make design B cheaper"' : 'Describe who you are designing for…'}
          />
          <p className="disclaimer">Costs are planning estimates. Confirm placements with an accessibility specialist before construction.</p>
        </div>
      </main>

      {openTurn?.plan && open && (
        <DesignPanel
          plan={openTurn.plan}
          designId={open.designId}
          onSelect={(designId) => setOpen({ ...open, designId })}
          onClose={() => setOpen(null)}
        />
      )}
      {!openTurn?.plan && scanPreview && <ScanPanel scan={scanPreview} onClose={() => setScanPreview(null)} />}
    </div>
  );
}
