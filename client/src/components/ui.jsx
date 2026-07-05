import './components.css';

export function Button({ variant = 'secondary', children, ...rest }) {
  return <button className={`btn btn-${variant}`} {...rest}>{children}</button>;
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return <Tag className={`card ${className}`} {...rest}>{children}</Tag>;
}

export function Callout({ tone = 'info', title, children }) {
  return (
    <div className={`callout callout-${tone}`}>
      {title ? <span className="callout-tag">{title}</span> : null}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ProgressMeter({ value, label }) {
  return (
    <div className="meter" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {label ? <div className="meter-head"><span>{label}</span><strong>{value}%</strong></div> : null}
      <div className="meter-track"><div className="meter-fill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={tab.id === active}
          className={`tab ${tab.id === active ? 'active' : ''}`}
          disabled={tab.disabled} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
