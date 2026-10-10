import { IconEar, IconEye, IconWheelchair } from './icons';

const SUGGESTIONS = [
  {
    icon: IconWheelchair,
    title: 'Sarah, software engineer',
    detail: 'Uses a wheelchair, starts next month',
    prompt: "We're designing for Sarah, a software engineer who uses a wheelchair. She starts next month and will work here full time.",
  },
  {
    icon: IconEar,
    title: 'Marcus, product designer',
    detail: 'Deaf, spends half his day in meetings',
    prompt: "We're designing for Marcus, a product designer who is Deaf. He's in meetings about half the day and needs to know about fire alarms and visitors.",
  },
  {
    icon: IconEye,
    title: 'Priya, data analyst',
    detail: 'Blind, uses a screen reader',
    prompt: "We're designing for Priya, a data analyst who is blind and uses a screen reader and cane. She needs to get from the entrance to her desk and the kitchenette on her own.",
  },
];

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="empty">
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="eyebrow">
        <span className="eyebrow-dot" /> Accessibility planner · ADA 2010
      </div>
      <h1>
        Who are we <span className="hl">designing</span> for?
      </h1>
      <p>Describe the employee. I'll audit the office, then build three 3D renovation plans with assistive products placed where they work best.</p>
      <div className="suggestions">
        {SUGGESTIONS.map(({ icon: Icon, title, detail, prompt }) => (
          <button key={title} className="suggestion" onClick={() => onPick(prompt)}>
            <span className="suggestion-icon">
              <Icon size={18} />
            </span>
            <strong>{title}</strong>
            <span>{detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
