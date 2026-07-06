import { useCurriculum } from '../../state/CurriculumContext';
import type { Session } from '../../types';

interface Props {
  session: Session;
  activeId: string;
  onSelect: (id: string) => void;
}

export function ExerciseRail({ session, activeId, onSelect }: Props) {
  const { curriculum, progress } = useCurriculum();
  const items = session.exerciseIds
    .map((id, i) => ({ id, index: i, ex: curriculum!.exercises.find((e) => e.id === id) }))
    .filter(({ ex }) => ex); // skip ids whose exercise lookup fails
  return (
    <aside className="ex-rail">
      {items.map(({ id, index, ex }) => {
        const done = Boolean(progress.completed[id]);
        return (
          <button key={id} onClick={() => onSelect(id)}
            aria-current={id === activeId ? 'true' : undefined}
            className={`ex-rail-item ${id === activeId ? 'active' : ''} ${done ? 'done' : ''}`}>
            <span className="ex-idx" aria-hidden="true">{done ? '✓' : index + 1}</span>
            <span className="ex-copy">
              <strong>{ex!.title}</strong><em>{ex!.database || 'verbal'}</em>
              {done ? <span className="visually-hidden">completed</span> : null}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
