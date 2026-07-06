import './components.css';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, ElementType } from 'react';

export const cx = (...parts: unknown[]): string => parts.filter(Boolean).join(' ');

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string;
}

export function Button({ variant = 'secondary', className, children, ...rest }: ButtonProps) {
  return <button type="button" className={cx('btn', `btn-${variant}`, className)} {...rest}>{children}</button>;
}

interface PillProps {
  tone?: string;
  className?: string;
  children?: ReactNode;
}

export function Pill({ tone = 'neutral', className, children }: PillProps) {
  return <span className={cx('pill', `pill-${tone}`, className)}>{children}</span>;
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export function Card({ as: Tag = 'div', className, children, ...rest }: CardProps) {
  return <Tag className={cx('card', className)} {...rest}>{children}</Tag>;
}

interface CalloutProps {
  tone?: string;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Callout({ tone = 'info', title, className, children }: CalloutProps) {
  return (
    <div className={cx('callout', `callout-${tone}`, className)}>
      {title ? <span className="callout-tag">{title}</span> : null}
      <div>{children}</div>
    </div>
  );
}

interface EmptyStateProps {
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({ title, className, children }: EmptyStateProps) {
  return (
    <div className={cx('empty-state', className)}>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

interface ProgressMeterProps {
  value: number;
  label?: ReactNode;
  className?: string;
}

export function ProgressMeter({ value, label, className }: ProgressMeterProps) {
  return (
    <div className={cx('meter', className)} role="progressbar"
      aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}
      aria-label={label ? undefined : 'progress'}>
      {label ? <div className="meter-head"><span>{label}</span><strong>{value}%</strong></div> : null}
      <div className="meter-track"><div className="meter-fill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
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
