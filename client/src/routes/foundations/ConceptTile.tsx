import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Concept } from '../../types';
import type { TileState } from '../../lib/foundations';

interface Props {
  concept: Concept;
  state: TileState;
  count: number;
  masteryPct: number;
  onReset: (skill: string) => void;
}

const STATIC_LABEL: Record<'upcoming' | 'locked', string> = {
  upcoming: 'upcoming',
  locked: 'locked'
};

export function ConceptTile({ concept, state, count, masteryPct, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const cls = ['lh-tile', state, state === 'done' && 'ok'].filter(Boolean).join(' ');
  const bar = <div className="lh-tile-bar"><i style={{ width: `${masteryPct}%` }} /></div>;

  if (state === 'upcoming' || state === 'locked') {
    return (
      <div className={cls} aria-label={`${concept.title}, ${state === 'locked' ? 'locked, unlocks as you progress' : 'upcoming'}`}>
        <div className="lh-tile-head">
          <span className="lh-tile-num">{concept.order}</span>
          <strong>{concept.title}</strong>
          <span className="lh-tile-tier">{STATIC_LABEL[state]}</span>
        </div>
        {bar}
      </div>
    );
  }

  const tier = state === 'done' ? 'strong' : count ? `${count}/3` : state === 'now' ? 'start here' : 'new';
  const name = state === 'now'
    ? `Start here: ${concept.title}, new lesson`
    : `Practice ${concept.title}${state === 'done' ? ', mastered' : count ? `, ${count} of 3 correct` : ''}`;

  return (
    <div className={cls}>
      <Link to={`/learn/concept/${concept.id}`} className="lh-tile-open" aria-label={name}>
        <div className="lh-tile-head">
          <span className="lh-tile-num">{state === 'done' ? '✓' : concept.order}</span>
          <strong>{concept.title}</strong>
          <span className="lh-tile-tier">{tier}</span>
          <span className="lh-tile-go" aria-hidden="true">Practice</span>
        </div>
        {bar}
      </Link>
      {count > 0 ? (
        confirming ? (
          <div className="lh-tile-reset-confirm" role="group" aria-label="Confirm reset">
            <span>Reset this lesson? Its full scaffold returns and it re-enters your reviews.</span>
            <button type="button" className="lh-reset-yes" onClick={() => { setConfirming(false); onReset(concept.skill); }}>Reset</button>
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="lh-tile-reset" onClick={() => setConfirming(true)}>Reset lesson</button>
        )
      ) : null}
    </div>
  );
}
