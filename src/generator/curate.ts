import type { DraftExercise, ConceptMeta } from './types';
import { normalizeExpectedSql } from './diversity';

const MAX_PER_SKILL = 15;

function difficultyRank(sql: string): number {
  const m = sql.match(/\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|JOIN|OVER|WITH)\b/gi);
  return m ? m.length : 0;
}

export function curate(drafts: DraftExercise[], meta: ConceptMeta[]): DraftExercise[] {
  const metaSkills = new Set(meta.map((m) => m.skill));
  const orderOf = new Map(meta.map((m) => [m.skill, m.order] as const));

  const seen = new Set<string>();
  const deduped: DraftExercise[] = [];
  for (const d of drafts) {
    if (!metaSkills.has(d.skill)) continue;
    const key = `${d.skill}|${normalizeExpectedSql(d.expectedSql)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(d);
  }

  const bySkill = new Map<string, DraftExercise[]>();
  for (const d of deduped) {
    const arr = bySkill.get(d.skill) ?? [];
    arr.push(d);
    bySkill.set(d.skill, arr);
  }

  const skills = [...bySkill.keys()].sort(
    (a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0)
  );

  const out: DraftExercise[] = [];
  for (const skill of skills) {
    const arr = bySkill.get(skill)!;
    arr.sort((a, b) => {
      const dr = difficultyRank(a.expectedSql) - difficultyRank(b.expectedSql);
      if (dr !== 0) return dr;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (const d of arr.slice(0, MAX_PER_SKILL)) out.push(d);
  }
  return out;
}

export function honestCounts(drafts: DraftExercise[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of drafts) counts[d.skill] = (counts[d.skill] ?? 0) + 1;
  return counts;
}
