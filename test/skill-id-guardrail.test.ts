import test from 'node:test';
import assert from 'node:assert/strict';

import { getLearningPath } from '../src/learning-path';

// Detector: returns any concept skill used by more than one concept.
function duplicateConceptSkills(concepts: Array<{ skill: string }>): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const c of concepts) {
    if (seen.has(c.skill)) dups.add(c.skill);
    seen.add(c.skill);
  }
  return [...dups];
}

test('flattened learning path skill ids are globally unique and 1:1 with concepts', () => {
  const path = getLearningPath();
  const concepts = path.concepts as Array<{ skill: string }>;
  const skills = path.skills as Array<{ skill: string }>;

  const dups = duplicateConceptSkills(concepts);
  assert.deepEqual(dups, [], `duplicate concept skill ids: ${dups.join(', ')}`);

  assert.equal(skills.length, concepts.length, 'skills[] length must equal concepts[] length');
  const conceptSkillSet = new Set(concepts.map((c) => c.skill));
  const skillSet = new Set(skills.map((s) => s.skill));
  assert.equal(conceptSkillSet.size, concepts.length, 'concept skills must be unique');
  assert.equal(skillSet.size, skills.length, 'skill entries must be unique');
  assert.deepEqual([...skillSet].sort(), [...conceptSkillSet].sort(), 'skills[] must be exactly the concept skill set');
});

test('the duplicate-skill detector catches a collision (guard bites)', () => {
  const collided = [{ skill: 'ap-x' }, { skill: 'ap-y' }, { skill: 'ap-x' }];
  assert.deepEqual(duplicateConceptSkills(collided), ['ap-x']);
});
