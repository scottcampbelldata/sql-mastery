import './components.css';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', className, children, ...rest }) {
  return <button type="button" className={cx('btn', `btn-${variant}`, className)} {...rest}>{children}</button>;
}

export function Pill({ tone = 'neutral', className, children }) {
  return <span className={cx('pill', `pill-${tone}`, className)}>{children}</span>;
}

export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('card', className)} {...rest}>{children}</Tag>;
}

export function Callout({ tone = 'info', title, className, children }) {
  return (
    <div className={cx('callout', `callout-${tone}`, className)}>
      {title ? <span className="callout-tag">{title}</span> : null}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, className, children }) {
  return (
    <div className={cx('empty-state', className)}>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ProgressMeter({ value, label, className }) {
  return (
    <div className={cx('meter', className)} role="progressbar"
      aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}
      aria-label={label ? undefined : 'progress'}>
      {label ? <div className="meter-head"><span>{label}</span><strong>{value}%</strong></div> : null}
      <div className="meter-track"><div className="meter-fill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={cx('tab-bar', className)} role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.id === active}
          className={cx('tab', tab.id === active && 'active')}
          disabled={tab.disabled} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
