import { ConceptTile } from './ConceptTile';
import { conceptMastery, tileState } from '../../lib/foundations';
import { phaseGraduation } from '../../lib/learning-path';
import { bandTierLabel, type BandGroup } from '../../lib/bands';
import { cx } from '../../components/ui';
import type { Checkpoint, Concept, LearningState, Track } from '../../types';

interface BandSectionProps {
  group: BandGroup;
  track: Track;
  state: LearningState;
  onReset: (skill: string) => void;
}

function CheckpointTile({ checkpoint, passed }: { checkpoint: Checkpoint; passed: boolean }) {
  return (
    <div className={cx('lh-tile', 'lh-tile-cp', passed && 'ok')}>
      <div className="lh-tile-head">
        <span className="lh-tile-num">{passed ? 'OK' : 'CP'}</span>
        <strong>{checkpoint.title}</strong>
        <span className="lh-tile-tier">{passed ? 'passed' : 'checkpoint'}</span>
      </div>
    </div>
  );
}

export function BandSection({ group, track, state, onReset }: BandSectionProps) {
  const { meta, phases, locked, strong, total } = group;

  return (
    <section className={cx('band-section', locked && 'locked', group.complete && 'done')} aria-labelledby={`band-${meta.level}`}>
      <div className="band-head">
        <div>
          <span className="band-kicker">{meta.badge}</span>
          <h2 id={`band-${meta.level}`}>{meta.title}</h2>
          <p>{meta.blurb}</p>
        </div>
        <div className="band-score" aria-label={`${strong} of ${total} skills strong`}>
          <strong>{strong}<span>/{total}</span></strong>
          <em>{locked ? 'Locked' : bandTierLabel(group)}</em>
        </div>
      </div>

      {locked ? (
        <div className="band-lock" role="note">
          <span className="band-lock-tag" aria-hidden="true">LOCKED</span>
          <p>Finish the previous capstone to unlock {meta.title}.</p>
        </div>
      ) : (
        <div className="band-phases">
          {phases.map((phase) => {
            const phaseStatus = phaseGraduation(phase, state);
            return (
              <section key={phase.id} className={cx('band-phase', phaseStatus.complete && 'done')} aria-label={phase.title}>
                <div className="band-phase-head">
                  <div>
                    <span className="band-phase-kicker">Phase {phase.order} / {phase.database}</span>
                    <h3>{phase.title}</h3>
                    {phase.goal ? <p>{phase.goal}</p> : null}
                  </div>
                  <div className="band-phase-meta">
                    <span className={cx('band-status', phaseStatus.complete ? 'done' : 'active')}>
                      {phaseStatus.complete ? 'complete' : 'available'}
                    </span>
                    <span className="band-phase-score">{phaseStatus.strong}/{phaseStatus.total}</span>
                  </div>
                </div>
                <div className="lh-grid band-grid">
                  {phase.concepts.map((concept: Concept) => (
                    (() => {
                      const mastery = conceptMastery(state, concept);
                      return (
                        <ConceptTile key={concept.id} concept={concept} state={tileState(track, state, concept)}
                          count={mastery.count} target={mastery.target} masteryPct={mastery.pct}
                          onReset={onReset} />
                      );
                    })()
                  ))}
                  {phase.checkpoints.map((checkpoint) => (
                    <CheckpointTile key={checkpoint.id} checkpoint={checkpoint}
                      passed={state.checkpointsPassed.includes(checkpoint.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
