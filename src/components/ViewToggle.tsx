interface ViewToggleProps {
  showFixes: boolean;
  onChange: (showFixes: boolean) => void;
}

export function ViewToggle({ showFixes, onChange }: ViewToggleProps) {
  return (
    <div className="view-toggle">
      <button className={!showFixes ? 'active' : ''} onClick={() => onChange(false)}>
        Before (Issues)
      </button>
      <button className={showFixes ? 'active' : ''} onClick={() => onChange(true)}>
        After (Fixes)
      </button>
    </div>
  );
}
