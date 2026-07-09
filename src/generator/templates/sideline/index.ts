import type {
  Template,
  ConceptMeta,
  PhaseMeta,
  CheckpointMeta
} from '../../types';

// Filled by T10.
export const SIDELINE_TEMPLATES: Template[] = [];
export const SIDELINE_SKILLS: string[] = [
  'sl-join-inner',
  'sl-join-multi',
  'sl-join-left',
  'sl-anti-join',
  'sl-semi-join',
  'sl-self-join-match',
  'sl-self-join-compare',
  'sl-join-right-full',
  'sl-join-aggregate',
  'sl-case-expression',
  'sl-subquery-scalar',
  'sl-subquery-in',
  'sl-subquery-correlated',
  'sl-cte',
  'sl-set-ops',
  'sl-date-functions',
  'sl-scd-asof',
  'sl-window-rank',
  'sl-window-lag-lead',
  'sl-window-running',
  'sl-window-frame-basic',
];
export const SIDELINE_CONCEPT_META: ConceptMeta[] = [];
export const SIDELINE_PHASES: PhaseMeta[] = [];
export const SIDELINE_CHECKPOINTS: CheckpointMeta[] = [];
