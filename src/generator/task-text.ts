import { fnv1a } from '../datasets/framework/prng';
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

export function renderTask(template: Template, binding: Binding): string {
  const phrasings = template.phrasings.length > 0 ? template.phrasings : ['{__missing__}'];
  const idx = fnv1a(`${template.skill}:task:${binding.bindingIndex}`) % phrasings.length;
  return fillPlaceholders(phrasings[idx], binding).trim();
}
