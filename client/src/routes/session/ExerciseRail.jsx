import { useCurriculum } from '../../state/CurriculumContext.jsx';

export function ExerciseRail({ session, activeId, onSelect }) {
  const { curriculum, progress } = useCurriculum();
  return (
    <aside className="ex-rail">
      {session.exerciseIds.map((id, i) => {
        const ex = curriculum.exercises.find((e) => e.id === id);
        const done = Boolean(progress.completed[id]);
        return (
          <button key={id} onClick={() => onSelect(id)}
            className={`ex-rail-item ${id === activeId ? 'active' : ''} ${done ? 'done' : ''}`}>
            <span className="ex-idx">{done ? '✓' : i + 1}</span>
            <span className="ex-copy"><strong>{ex.title}</strong><em>{ex.database || 'verbal'}</em></span>
          </button>
        );
      })}
    </aside>
  );
}
