import { fnv1a } from '../datasets/framework/prng';
import { emitSql } from './emit';
import { buildScaffold } from './scaffold';
import { renderHint } from './hint';
import { renderTask } from './task-text';
import type { Catalog } from './schema-catalog';
import type { DraftExercise, Template, Binding } from './types';

function canonicalBinding(binding: Binding): string {
  const slots = Object.keys(binding.slots).sort()
    .map((k) => `${k}=${binding.slots[k]}`)
    .join('|');
  const literals = Object.keys(binding.literals).sort()
    .map((k) => `${k}=${binding.literals[k]}`)
    .join('|');
  return `${slots}#${literals}`;
}

export function assembleExercise(
  template: Template,
  binding: Binding,
  catalog: Catalog
): DraftExercise {
  const expectedSql = emitSql(template, binding, catalog).trim();
  const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
  const id = `${template.skill}-${fnv1a(`${template.skill}::${canonicalBinding(binding)}`).toString(36)}`;
  return {
    id,
    skill: template.skill,
    database: template.database,
    task: renderTask(template, binding),
    starterSql,
    blankMap,
    hint: renderHint(template, binding),
    expectedSql,
    orderMatters: template.gateHints.orderMatters,
    rowCeiling: template.gateHints.rowCeiling
  };
}
