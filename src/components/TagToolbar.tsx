import type { TagTool } from '../scene/Scene';

interface TagToolbarProps {
  tagTool: TagTool;
  onChange: (tool: TagTool) => void;
}

const TOOLS: { value: Exclude<TagTool, null>; label: string }[] = [
  { value: 'door', label: 'Tag Door' },
  { value: 'stairs', label: 'Tag Stairs' },
  { value: 'obstacle', label: 'Tag Obstacle' },
  { value: 'erase', label: 'Erase' },
];

export function TagToolbar({ tagTool, onChange }: TagToolbarProps) {
  return (
    <div className="tag-toolbar">
      <button className={tagTool === null ? 'active' : ''} onClick={() => onChange(null)}>
        Tag: Off
      </button>
      {TOOLS.map((t) => (
        <button key={t.value} className={tagTool === t.value ? 'active' : ''} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
      {tagTool && tagTool !== 'erase' && (
        <span className="tag-toolbar-hint">Click anywhere on the model to place a {tagTool}.</span>
      )}
      {tagTool === 'erase' && <span className="tag-toolbar-hint">Click a tagged element to remove it.</span>}
    </div>
  );
}
