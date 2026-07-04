(function(){
  const app = document.getElementById('app');
  const progressKey = 'sqlm:product-progress:v1';
  const activeKey = 'sqlm:product-active-session:v1';
  const sidebarKey = 'sqlm:sidebar-collapsed:v1';
  const state = {
    curriculum: null,
    progress: loadProgress(),
    feedback: {},
    results: {},
    answersOpen: {},
    schemas: {},
    schemaErrors: {},
    schemaLoading: {},
    tablePreviews: {},
    tablePreviewErrors: {},
    tablePreviewLoading: {},
    activeSchemaTable: {},
    activeQueryTabs: {},
    sidebarCollapsed: localStorage.getItem(sidebarKey) === '1',
    activeSessionId: localStorage.getItem(activeKey) || '',
    activeExerciseId: ''
  };

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(progressKey)) || { completed: {}, attempts: {}, lastSql: {} };
    } catch (error) {
      return { completed: {}, attempts: {}, lastSql: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(progressKey, JSON.stringify(state.progress));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function percent(done, total) {
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }

  function exerciseById(id) {
    return state.curriculum.exercises.find((exercise) => exercise.id === id);
  }

  function sessionById(id) {
    return state.curriculum.sessions.find((session) => session.id === id);
  }

  function completedCount(ids) {
    return ids.filter((id) => state.progress.completed[id]).length;
  }

  function sessionComplete(session) {
    return completedCount(session.exerciseIds) === session.exerciseIds.length;
  }

  function currentSession() {
    if (state.activeSessionId && sessionById(state.activeSessionId)) return sessionById(state.activeSessionId);
    return state.curriculum.sessions.find((session) => !sessionComplete(session)) || state.curriculum.sessions[0];
  }

  function setRoute(hash) {
    window.location.hash = hash;
  }

  function route() {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash.startsWith('session=')) {
      const params = new URLSearchParams(hash);
      return {
        view: 'session',
        sessionId: params.get('session'),
        exerciseId: params.get('exercise') || ''
      };
    }
    return { view: 'dashboard' };
  }

  function render() {
    if (!state.curriculum) return;
    const current = currentSession();
    const routeState = route();
    const total = state.curriculum.exercises.length;
    const done = Object.keys(state.progress.completed).length;

    app.className = `product-shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}`;
    app.innerHTML = `
      <aside class="side-nav cockpit-nav">
        <div class="brand-lockup">
          <div class="brand-row">
            <div class="brand-copy">
              <span>SQL Mastery Path</span>
              <strong>Analyst cockpit</strong>
              <em>${state.curriculum.stats.totalWeeks} weeks. Local data. Interview proof.</em>
            </div>
            <button class="sidebar-toggle" type="button" data-action="toggle-sidebar" aria-label="${state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}" title="${state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
              <span aria-hidden="true">${state.sidebarCollapsed ? '>' : '<'}</span>
            </button>
          </div>
        </div>
        <nav class="nav-section">
          <button class="nav-link ${routeState.view === 'dashboard' ? 'active' : ''}" data-action="dashboard" title="Dashboard"><span class="nav-glyph" aria-hidden="true">D</span><span class="nav-text">Dashboard</span></button>
          <button class="nav-link ${routeState.view === 'session' ? 'active' : ''}" data-action="open-session" data-session-id="${current.id}" title="Today&apos;s session"><span class="nav-glyph" aria-hidden="true">S</span><span class="nav-text">Today&apos;s session</span></button>
          <a class="nav-link" href="m1-fundamentals.html" title="Reference lessons"><span class="nav-glyph" aria-hidden="true">R</span><span class="nav-text">Reference lessons</span></a>
        </nav>
        <div class="course-meter">
          <div class="meter-label">Course progress</div>
          <div class="meter-number">${percent(done, total)}%</div>
          <div class="meter-track"><div class="meter-fill" style="width:${percent(done, total)}%"></div></div>
        </div>
      </aside>
      <main class="main-panel">
        ${routeState.view === 'session' ? renderSession(routeState.sessionId, routeState.exerciseId) : renderDashboard()}
      </main>
    `;
  }

  function renderDashboard() {
    const current = currentSession();
    const stats = state.curriculum.stats;
    const done = Object.keys(state.progress.completed).length;
    const total = state.curriculum.exercises.length;
    return `
      <section class="top-strip cockpit-header">
        <div>
          <span class="section-kicker">Training command</span>
          <h1>SQL interview readiness, built on real data</h1>
          <p>${escapeHtml(state.curriculum.product.cadence)}. Work the path, prove the result, move on.</p>
        </div>
        <div class="top-actions">
          <button class="secondary-btn" data-action="reset-progress">Reset progress</button>
          <button class="primary-btn" data-action="open-session" data-session-id="${current.id}">Continue</button>
        </div>
      </section>
      <section class="hero-grid command-deck">
        <div class="hero-card mission-panel">
          <span class="eyebrow">Commercial course mode</span>
          <h2>${escapeHtml(state.curriculum.product.promise)}</h2>
          <p>Every graded exercise runs against your local PostgreSQL data and compares result sets, so practice feels like the interview screen you are trying to pass.</p>
          <div class="database-ribbon" aria-label="Available practice databases">
            <span>chinook</span>
            <span>northwind</span>
            <span>stackoverflow</span>
            <span>nyctaxi</span>
            <span>adventureworks</span>
          </div>
          <div class="stat-grid">
            <div class="stat metric-card"><strong>${stats.totalWeeks}</strong><span>weeks</span></div>
            <div class="stat metric-card"><strong>${stats.totalSessions}</strong><span>sessions</span></div>
            <div class="stat metric-card"><strong>${stats.totalExercises}</strong><span>exercises</span></div>
            <div class="stat metric-card"><strong>${stats.estimatedAttempts}+</strong><span>attempts</span></div>
          </div>
        </div>
        <div class="today-card mission-brief">
          <div class="session-meta">
            <span class="pill">Week ${current.week}</span>
            <span class="pill">${current.durationMinutes} min</span>
            <span class="pill ${sessionComplete(current) ? 'good' : 'warn'}">${completedCount(current.exerciseIds)} / ${current.exerciseIds.length} solved</span>
          </div>
          <h3>${escapeHtml(current.title)}</h3>
          <p>${escapeHtml(current.goal)}</p>
          <button class="primary-btn" data-action="open-session" data-session-id="${current.id}">Start session</button>
        </div>
      </section>
      <section class="panel-card">
        <div class="panel-heading">
          <span class="section-kicker">Course map</span>
          <h3>${state.curriculum.stats.totalWeeks}-week mastery map</h3>
        </div>
        <div class="week-map week-lattice">
          ${state.curriculum.weeks.map(renderWeekCard).join('')}
        </div>
      </section>
      <section class="panel-card">
        <div class="panel-heading">
          <span class="section-kicker">Next reps</span>
          <h3>Session queue</h3>
        </div>
        <div class="session-list">
          ${state.curriculum.sessions.slice(0, 12).map(renderSessionCard).join('')}
        </div>
      </section>
    `;
  }

  function renderWeekCard(week) {
    const sessions = week.sessions.map(sessionById);
    const totalExercises = sessions.reduce((sum, session) => sum + session.exerciseIds.length, 0);
    const completed = sessions.reduce((sum, session) => sum + completedCount(session.exerciseIds), 0);
    const pct = percent(completed, totalExercises);
    const currentWeek = currentSession().week === week.number;
    return `
      <button class="week-card ${pct === 100 ? 'complete' : ''} ${currentWeek ? 'current' : ''}" data-action="open-session" data-session-id="${week.sessions[0]}">
        <span class="week-num">Week ${week.number}</span>
        <h3>${escapeHtml(week.title)}</h3>
        <p>${escapeHtml(week.outcome)}</p>
        <div class="week-progress"><span style="width:${pct}%"></span></div>
      </button>
    `;
  }

  function renderSessionCard(session) {
    const done = completedCount(session.exerciseIds);
    return `
      <button class="session-card ${sessionComplete(session) ? 'complete' : ''}" data-action="open-session" data-session-id="${session.id}">
        <div class="session-meta">
          <span class="pill">Week ${session.week}.${session.day}</span>
          <span class="pill">${session.durationMinutes} min</span>
          <span class="pill">${done}/${session.exerciseIds.length}</span>
        </div>
        <h3>${escapeHtml(session.title)}</h3>
        <p>${escapeHtml(session.goal)}</p>
      </button>
    `;
  }

  function renderSession(sessionId, exerciseId) {
    const session = sessionById(sessionId) || currentSession();
    state.activeSessionId = session.id;
    localStorage.setItem(activeKey, session.id);
    const firstIncomplete = session.exerciseIds.find((id) => !state.progress.completed[id]) || session.exerciseIds[0];
    const activeExerciseId = exerciseId || state.activeExerciseId || firstIncomplete;
    state.activeExerciseId = activeExerciseId;
    const exercise = exerciseById(activeExerciseId) || exerciseById(session.exerciseIds[0]);

    return `
      <section class="top-strip cockpit-header session-header">
        <div>
          <span class="section-kicker">Active session</span>
          <h1>${escapeHtml(session.title)}</h1>
          <p>Week ${session.week}, session ${session.day}. ${escapeHtml(session.goal)}</p>
        </div>
        <div class="top-actions">
          <button class="secondary-btn" data-action="dashboard">Dashboard</button>
          <a class="ghost-link" href="${escapeHtml(exercise.sourceFile)}">Open source lesson</a>
        </div>
      </section>
      <section class="workspace analysis-grid">
        <aside class="lesson-rail">
          ${session.exerciseIds.map((id) => renderRailCard(id, session.id, activeExerciseId)).join('')}
        </aside>
        ${renderWorkbench(exercise, session)}
      </section>
    `;
  }

  function renderRailCard(id, sessionId, activeId) {
    const exercise = exerciseById(id);
    return `
      <button class="rail-card ${id === activeId ? 'active' : ''} ${state.progress.completed[id] ? 'complete' : ''}" data-action="open-exercise" data-session-id="${sessionId}" data-exercise-id="${id}">
        <strong>${escapeHtml(exercise.title)} ${state.progress.completed[id] ? 'Complete' : ''}</strong>
        <span>${escapeHtml(exercise.moduleTitle)} - ${escapeHtml(exercise.database || 'verbal')}</span>
      </button>
    `;
  }

  function renderWorkbench(exercise, session) {
    const feedback = state.feedback[exercise.id];
    const result = state.results[exercise.id];
    const sql = state.progress.lastSql[exercise.id] || '';
    return `
      <article class="workbench studio-workbench" data-exercise-id="${exercise.id}">
        <div class="session-meta">
          <span class="pill">${escapeHtml(exercise.stage)}</span>
          <span class="pill">${escapeHtml(exercise.moduleTitle)}</span>
          <span class="pill">${escapeHtml(exercise.level || 'practice')}</span>
          <span class="pill ${exercise.checkable ? 'good' : 'warn'}">${exercise.checkable ? 'graded' : 'manual'}</span>
        </div>
        <h2>${escapeHtml(exercise.title)}</h2>
        <div class="session-meta">
          <span class="pill">Database: ${escapeHtml(exercise.database || 'none')}</span>
          <span class="pill">Session ${session.sequence} of ${state.curriculum.sessions.length}</span>
        </div>
        <p class="task-copy">${escapeHtml(exercise.task)}</p>
        ${renderLessonBrief(exercise)}
        ${exercise.hint ? `<button class="secondary-btn" data-action="show-hint" data-exercise-id="${exercise.id}">Hint</button>` : ''}
        <div class="editor-shell">
          <div class="editor-chrome">
            <label class="editor-label" for="sql-editor">Your SQL</label>
            <span>${escapeHtml(exercise.database || 'manual review')}</span>
          </div>
          <textarea id="sql-editor" class="sql-editor" spellcheck="false" data-action="sql-input" data-exercise-id="${exercise.id}" placeholder="${escapeHtml(exercise.expectedSql.split('\n')[0] || 'SELECT ...')}">${escapeHtml(sql)}</textarea>
        </div>
        <div class="workbench-actions">
          <button class="primary-btn" data-action="run-check" data-exercise-id="${exercise.id}" ${exercise.checkable ? '' : 'disabled'}>Run and check</button>
          <button class="secondary-btn" data-action="toggle-answer" data-exercise-id="${exercise.id}">${state.answersOpen[exercise.id] ? 'Hide answer' : 'Reveal model answer'}</button>
          <button class="secondary-btn" data-action="next-exercise" data-session-id="${session.id}" data-exercise-id="${exercise.id}">Next step</button>
        </div>
        ${feedback ? renderFeedback(feedback) : '<div class="feedback-panel coach-panel"><strong>Ready when you are.</strong><p>Write the query, run it, read the feedback, revise, then run it again.</p></div>'}
        ${renderQueryTabs(exercise, result)}
        ${state.answersOpen[exercise.id] ? `<div class="answer-drawer"><pre>${escapeHtml(exercise.expectedSql || exercise.solutionNote || 'This exercise is manually reviewed.')}</pre></div>` : ''}
      </article>
    `;
  }

  function renderList(items, className) {
    if (!Array.isArray(items) || !items.length) return '';
    return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  function renderLessonBrief(exercise) {
    if (!exercise.concept && !exercise.mentalModel && !exercise.workedExample && !exercise.interviewAngle) return '';

    return `
      <section class="lesson-brief" aria-label="Lesson brief">
        ${exercise.concept ? `<div class="lesson-concept"><span>What you are learning</span><p>${escapeHtml(exercise.concept)}</p></div>` : ''}
        ${exercise.whyItMatters ? `<div class="lesson-concept"><span>Why it matters</span><p>${escapeHtml(exercise.whyItMatters)}</p></div>` : ''}
        ${exercise.mentalModel ? `<div class="mental-model"><span>Mental model</span><p>${escapeHtml(exercise.mentalModel)}</p></div>` : ''}
        ${exercise.workedExample ? `<div class="worked-example"><span>Worked example</span><p>${escapeHtml(exercise.workedExample)}</p></div>` : ''}
        ${Array.isArray(exercise.steps) && exercise.steps.length ? `<div class="lesson-steps"><span>How to approach it</span>${renderList(exercise.steps, 'step-list')}</div>` : ''}
        ${Array.isArray(exercise.commonMistakes) && exercise.commonMistakes.length ? `<div class="mistake-list"><span>Common mistakes</span>${renderList(exercise.commonMistakes, 'mistake-items')}</div>` : ''}
        ${exercise.interviewAngle ? `<div class="interview-angle"><span>Interview angle</span><p>${escapeHtml(exercise.interviewAngle)}</p></div>` : ''}
      </section>
    `;
  }

  function renderFeedback(feedback) {
    return `
      <div class="feedback-panel coach-panel ${feedback.kind}">
        <strong>${escapeHtml(feedback.title)}</strong>
        <p>${escapeHtml(feedback.message)}</p>
      </div>
    `;
  }

  function renderResult(result) {
    if (!result.columns || !result.columns.length) return '';
    return renderDataTable(result.columns, result.rows);
  }

  function renderDataTable(columns, rows) {
    return `
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.slice(0, 100).map((row) => `
            <tr>${columns.map((column) => `<td title="${escapeHtml(row[column])}">${escapeHtml(row[column] == null ? 'NULL' : row[column])}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function tableKey(table) {
    return `${table.schema}.${table.name}`;
  }

  function previewKey(database, schema, table) {
    return `${database}:${schema}.${table}`;
  }

  function formatEstimatedRows(value) {
    return Number.isFinite(Number(value)) ? `~${Number(value).toLocaleString()} rows` : 'unknown rows';
  }

  function renderQueryTabs(exercise, result) {
    const hasDatabase = Boolean(exercise.database);
    const activeTab = state.activeQueryTabs[exercise.id] || (result ? 'results' : 'database');
    const selectedTab = hasDatabase ? activeTab : 'results';

    return `
      <section class="query-tabs compact-dock" aria-label="Query output and database reference">
        <div class="tab-bar">
          <button class="query-tab ${selectedTab === 'results' ? 'active' : ''}" data-action="set-query-tab" data-exercise-id="${exercise.id}" data-tab="results">Query results</button>
          <button class="query-tab ${selectedTab === 'database' ? 'active' : ''}" data-action="set-query-tab" data-exercise-id="${exercise.id}" data-tab="database" ${hasDatabase ? '' : 'disabled'}>Database: ${escapeHtml(exercise.database || 'none')}</button>
        </div>
        <div class="tab-panel">
          ${selectedTab === 'database'
            ? renderSchemaExplorer(exercise.database)
            : `<div class="result-panel">${result ? renderResult(result) : '<div class="preview-empty">Run your SQL to see rows, columns, and checker output here.</div>'}</div>`}
        </div>
      </section>
    `;
  }

  function renderSchemaExplorer(database) {
    if (!database) {
      return '<div class="schema-explorer"><div class="preview-empty">This exercise does not use a live database.</div></div>';
    }

    const schema = state.schemas[database];
    const error = state.schemaErrors[database];

    if (error) {
      return `<div class="schema-explorer"><div class="coach-panel error"><strong>Could not load ${escapeHtml(database)}</strong><p>${escapeHtml(error)}</p></div></div>`;
    }

    if (!schema) {
      loadSchema(database);
      return `<div class="schema-explorer"><div class="preview-empty">Loading ${escapeHtml(database)} tables...</div></div>`;
    }

    if (!schema.tables.length) {
      return `<div class="schema-explorer"><div class="preview-empty">${escapeHtml(database)} has no user tables to show.</div></div>`;
    }

    if (!state.activeSchemaTable[database]) {
      state.activeSchemaTable[database] = tableKey(schema.tables[0]);
    }

    const activeTable = schema.tables.find((table) => tableKey(table) === state.activeSchemaTable[database]) || schema.tables[0];
    const activeKey = tableKey(activeTable);
    state.activeSchemaTable[database] = activeKey;

    return `
      <div class="schema-explorer">
        <div class="table-strip" aria-label="${escapeHtml(database)} tables">
          ${schema.tables.map((table) => `
            <button class="table-tab ${tableKey(table) === activeKey ? 'active' : ''}" data-action="select-schema-table" data-database="${escapeHtml(database)}" data-schema="${escapeHtml(table.schema)}" data-table="${escapeHtml(table.name)}" title="${escapeHtml(`${table.schema}.${table.name} - ${formatEstimatedRows(table.estimatedRows)}`)}">
              <strong>${escapeHtml(table.name)}</strong>
              <span>${escapeHtml(table.schema)} · ${escapeHtml(formatEstimatedRows(table.estimatedRows))}</span>
            </button>
          `).join('')}
        </div>
        <div class="database-grid">
          ${renderTablePreview(database, activeTable)}
        </div>
      </div>
    `;
  }

  function renderColumnMap(table) {
    return `
      <section class="column-map" aria-label="${escapeHtml(table.name)} columns">
        <div class="schema-card-heading">
          <span class="section-kicker">Columns</span>
          <h4>${escapeHtml(table.schema)}.${escapeHtml(table.name)}</h4>
        </div>
        <div class="column-list">
          ${table.columns.map((column) => `
            <div class="column-row">
              <div>
                <strong>${escapeHtml(column.name)}</strong>
                <span>${escapeHtml(column.type)}${column.nullable ? ' · nullable' : ' · required'}</span>
              </div>
              <div class="key-badges">
                ${column.isPrimaryKey ? '<em>PK</em>' : ''}
                ${column.foreignKey ? `<em>FK ${escapeHtml(column.foreignKey.table)}.${escapeHtml(column.foreignKey.column)}</em>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderTablePreview(database, table) {
    const key = previewKey(database, table.schema, table.name);
    const preview = state.tablePreviews[key];
    const error = state.tablePreviewErrors[key];

    if (error) {
      return `<section class="table-preview"><div class="coach-panel error"><strong>Preview failed</strong><p>${escapeHtml(error)}</p></div></section>`;
    }

    if (!preview) {
      loadTablePreview(database, table.schema, table.name);
      return `<section class="table-preview"><div class="preview-empty">Loading sample rows from ${escapeHtml(table.name)}...</div></section>`;
    }

    return `
      <section class="table-preview" aria-label="${escapeHtml(table.name)} sample rows">
        ${preview.columns.length
          ? renderDataTable(preview.columns, preview.rows)
          : '<div class="preview-empty">This table returned no previewable columns.</div>'}
      </section>
    `;
  }

  async function loadSchema(database) {
    if (!database || state.schemas[database] || state.schemaLoading[database]) return;
    state.schemaLoading[database] = true;
    state.schemaErrors[database] = '';

    try {
      const response = await fetch(`/api/schema?database=${encodeURIComponent(database)}`);
      const body = await response.json();
      if (!response.ok) throw body;

      state.schemas[database] = body;
      if (body.tables && body.tables.length) {
        state.activeSchemaTable[database] = tableKey(body.tables[0]);
        loadTablePreview(database, body.tables[0].schema, body.tables[0].name);
      }
    } catch (error) {
      state.schemaErrors[database] = error.error || 'The database schema could not be loaded.';
    } finally {
      state.schemaLoading[database] = false;
      render();
    }
  }

  async function loadTablePreview(database, schema, table) {
    const key = previewKey(database, schema, table);
    if (!database || !schema || !table || state.tablePreviews[key] || state.tablePreviewLoading[key]) return;
    state.tablePreviewLoading[key] = true;
    state.tablePreviewErrors[key] = '';

    try {
      const response = await fetch('/api/table-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ database, schema, table, limit: 6 })
      });
      const body = await response.json();
      if (!response.ok) throw body;

      state.tablePreviews[key] = body;
    } catch (error) {
      state.tablePreviewErrors[key] = error.error || 'Sample rows could not be loaded.';
    } finally {
      state.tablePreviewLoading[key] = false;
      render();
    }
  }

  async function runCheck(exerciseId) {
    const exercise = exerciseById(exerciseId);
    const editor = document.querySelector(`[data-exercise-id="${exerciseId}"].sql-editor, .sql-editor[data-exercise-id="${exerciseId}"]`);
    const sql = editor ? editor.value.trim() : state.progress.lastSql[exerciseId] || '';
    state.progress.lastSql[exerciseId] = sql;
    state.progress.attempts[exerciseId] = (state.progress.attempts[exerciseId] || 0) + 1;
    saveProgress();

    if (!sql) {
      state.feedback[exerciseId] = {
        kind: 'warn',
        title: 'Type a query first',
        message: 'Use the task statement to decide your SELECT, FROM, filters, sort, and limit.'
      };
      render();
      return;
    }

    state.feedback[exerciseId] = { kind: 'warn', title: 'Checking your SQL', message: 'Running your result and the lesson result on the same database.' };
    render();

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          database: exercise.database,
          sql,
          expectedSql: exercise.expectedSql
        })
      });
      const body = await response.json();
      if (!response.ok) throw body;

      state.results[exerciseId] = body.result;
      state.activeQueryTabs[exerciseId] = 'results';
      if (body.correct) {
        state.progress.completed[exerciseId] = {
          completedAt: new Date().toISOString(),
          attempts: state.progress.attempts[exerciseId]
        };
        state.feedback[exerciseId] = {
          kind: 'success',
          title: body.message,
          message: body.why
        };
      } else {
        state.feedback[exerciseId] = {
          kind: body.feedbackType === 'error' ? 'error' : 'warn',
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Close, but not correct yet',
          message: body.hint || body.message
        };
      }
      saveProgress();
    } catch (error) {
      state.feedback[exerciseId] = {
        kind: 'error',
        title: 'The checker could not run',
        message: error.error || 'Make sure the local server and database are running.'
      };
    }
    render();
  }

  function nextExercise(sessionId, exerciseId) {
    const session = sessionById(sessionId);
    const index = session.exerciseIds.indexOf(exerciseId);
    const nextId = session.exerciseIds[index + 1];
    if (nextId) {
      state.activeExerciseId = nextId;
      setRoute(`session=${sessionId}&exercise=${nextId}`);
      return;
    }
    const nextSession = state.curriculum.sessions[session.sequence];
    if (nextSession) setRoute(`session=${nextSession.id}`);
  }

  app.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    if (action === 'dashboard') setRoute('dashboard');
    if (action === 'open-session') setRoute(`session=${target.dataset.sessionId}`);
    if (action === 'open-exercise') setRoute(`session=${target.dataset.sessionId}&exercise=${target.dataset.exerciseId}`);
    if (action === 'run-check') runCheck(target.dataset.exerciseId);
    if (action === 'next-exercise') nextExercise(target.dataset.sessionId, target.dataset.exerciseId);
    if (action === 'toggle-sidebar') {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem(sidebarKey, state.sidebarCollapsed ? '1' : '0');
      render();
    }
    if (action === 'set-query-tab') {
      state.activeQueryTabs[target.dataset.exerciseId] = target.dataset.tab;
      render();
    }
    if (action === 'select-schema-table') {
      const database = target.dataset.database;
      const schema = target.dataset.schema;
      const table = target.dataset.table;
      state.activeSchemaTable[database] = `${schema}.${table}`;
      loadTablePreview(database, schema, table);
      render();
    }
    if (action === 'show-hint') {
      const exercise = exerciseById(target.dataset.exerciseId);
      state.feedback[exercise.id] = { kind: 'warn', title: 'Hint', message: exercise.hint || 'Compare your query shape to the task.' };
      render();
    }
    if (action === 'toggle-answer') {
      state.answersOpen[target.dataset.exerciseId] = !state.answersOpen[target.dataset.exerciseId];
      render();
    }
    if (action === 'reset-progress') {
      if (confirm('Reset all local SQL Mastery progress?')) {
        state.progress = { completed: {}, attempts: {}, lastSql: {} };
        saveProgress();
        render();
      }
    }
  });

  app.addEventListener('input', (event) => {
    if (event.target.dataset.action !== 'sql-input') return;
    state.progress.lastSql[event.target.dataset.exerciseId] = event.target.value;
    saveProgress();
  });

  window.addEventListener('hashchange', render);

  async function init() {
    try {
      const response = await fetch('/api/curriculum');
      if (!response.ok) throw new Error('Curriculum failed to load.');
      state.curriculum = await response.json();
      render();
    } catch (error) {
      app.className = 'app-loading';
      app.innerHTML = `<div class="empty-state"><h2>Could not load the course</h2><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  init();
})();
