import type { Template, Binding } from './types';

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

function fillPlaceholders(text: string, binding: Binding): string {
  return text.replace(/\{([A-Za-z0-9_]+)(:human)?\}/g, (_match, name: string, human?: string) => {
    const raw = binding.slots[name] ?? binding.literals[name];
    if (raw === undefined) return `{${name}}`;
    return human ? humanize(raw) : raw;
  });
}

export function renderHint(template: Template, binding: Binding): string {
  return fillPlaceholders(template.hintTemplate, binding).trim();
}
