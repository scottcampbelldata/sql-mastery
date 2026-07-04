// Progress tracking for practice problems. Works when opened locally in a
// browser; degrades gracefully anywhere storage is unavailable.
(function(){
  var store = null;
  try { store = window.localStorage; store.setItem('__t','1'); store.removeItem('__t'); }
  catch(e){ store = null; }

  var page = document.body.getAttribute('data-page') || location.pathname;

  document.querySelectorAll('input.done').forEach(function(cb){
    var key = 'sqlm:' + page + ':' + cb.getAttribute('data-id');
    if (store && store.getItem(key) === '1') cb.checked = true;
    cb.addEventListener('change', function(){
      if (!store) return;
      if (cb.checked) store.setItem(key,'1'); else store.removeItem(key);
      updateCount();
    });
  });

  function updateCount(){
    var el = document.getElementById('done-count');
    if (!el) return;
    var boxes = document.querySelectorAll('input.done');
    var done = 0;
    boxes.forEach(function(b){ if (b.checked) done++; });
    el.textContent = done + ' / ' + boxes.length + ' solved';
  }
  updateCount();
})();

// Guided practice runner for problems that include a solution SQL block.
(function(){
  var problems = Array.prototype.slice.call(document.querySelectorAll('.problem'));
  if (!problems.length) return;

  var store = null;
  try { store = window.localStorage; }
  catch(e){ store = null; }

  var page = document.body.getAttribute('data-page') || location.pathname;
  var lessonMap = {
    'P1.1': 'SELECT, expressions, aliases, decimal math, ORDER BY, LIMIT',
    'P1.2': 'WHERE filters with BETWEEN, IN, booleans, and tie-breaking sorts',
    'P1.3': 'NULL handling with IS NULL and ordered backlog lists',
    'P1.4': 'Case-insensitive text search and NULLS LAST sorting',
    'P1.5': 'Finding data-quality outliers with compound filters',
    'P1.6': 'AND/OR precedence and intentional parentheses',
    'P1.7': 'DISTINCT over whole selected rows',
    'P1.8': 'NULL predicates in AdventureWorks schemas',
    'P1.9': 'Date ranges, question filters, ORDER BY, and LIMIT',
    'P1.10': 'Computed columns and why SELECT aliases have limits',
    'P1.11': 'OR logic with NULL checks and text search',
    'P1.12': 'Exact filters, newest-first sorting, and NULL assumptions'
  };

  function problemId(problem) {
    var pid = problem.querySelector('.pid');
    return pid ? pid.textContent.trim() : 'problem';
  }

  function cleanDatabaseName(problem) {
    var db = problem.querySelector('.db');
    return db ? db.textContent.trim() : '';
  }

  function taskText(problem) {
    var prompt = problem.querySelector('.pbody > p');
    return prompt ? prompt.textContent.trim().replace(/\s+/g, ' ') : 'Write the SQL for this exercise.';
  }

  function extractFirstSqlStatement(text) {
    var statements = String(text || '')
      .split(';')
      .map(function(statement){ return statement.trim(); })
      .filter(function(statement){ return /\bselect\b/i.test(statement); });

    return statements.length ? statements[0] + ';' : '';
  }

  function feedbackClass(type) {
    if (type === 'success') return ' ok';
    if (type === 'error') return ' error';
    if (type === 'mismatch') return ' warn';
    return '';
  }

  function formatCell(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') {
      try { return JSON.stringify(value); }
      catch(e){ return String(value); }
    }
    return String(value);
  }

  function renderResultTable(container, result) {
    container.textContent = '';
    if (!result || !result.columns || result.columns.length === 0) return;

    var table = document.createElement('table');
    table.className = 'guided-result-table';
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    result.columns.forEach(function(column) {
      var th = document.createElement('th');
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    result.rows.slice(0, 100).forEach(function(row) {
      var tr = document.createElement('tr');
      result.columns.forEach(function(column) {
        var td = document.createElement('td');
        var value = formatCell(row[column]);
        td.textContent = value;
        td.title = value;
        if (value === 'NULL') td.className = 'runner-null';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    if (result.rows.length > 100) {
      var note = document.createElement('div');
      note.className = 'guided-note';
      note.textContent = 'Showing first 100 of ' + result.rows.length + ' returned row(s).';
      container.appendChild(note);
    }
  }

  function setProblemSolved(problem) {
    var checkbox = problem.querySelector('input.done');
    if (!checkbox || checkbox.checked) return;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function nextProblem(problem) {
    var index = problems.indexOf(problem);
    return index >= 0 ? problems[index + 1] : null;
  }

  function addWorkbench(problem) {
    if (problem.querySelector('.guided-workbench')) return;

    var id = problemId(problem);
    var database = cleanDatabaseName(problem);
    var solutionPre = problem.querySelector('details.sol pre');
    var expectedSql = solutionPre ? extractFirstSqlStatement(solutionPre.textContent) : '';

    if (!database || /all five|any/i.test(database) || !expectedSql) return;

    var key = 'sqlm:guided:' + page + ':' + id;
    var savedSql = store ? store.getItem(key) : '';
    var lesson = lessonMap[id] || ((document.querySelector('h1') || {}).textContent || 'SQL practice');

    var workbench = document.createElement('div');
    workbench.className = 'guided-workbench';
    workbench.innerHTML = [
      '<div class="guided-meta">',
      '  <span>Learn</span><strong></strong>',
      '  <span>Database</span><code></code>',
      '</div>',
      '<p class="guided-task"></p>',
      '<label class="guided-label">Your SQL</label>',
      '<textarea class="guided-sql" spellcheck="false"></textarea>',
      '<div class="guided-actions">',
      '  <button class="guided-run" type="button">Run and check</button>',
      '  <button class="guided-hint" type="button">Hint</button>',
      '  <button class="guided-next" type="button" hidden>Next step</button>',
      '</div>',
      '<div class="guided-feedback" aria-live="polite"></div>',
      '<div class="guided-results"></div>'
    ].join('');

    workbench.querySelector('.guided-meta strong').textContent = lesson;
    workbench.querySelector('.guided-meta code').textContent = database;
    workbench.querySelector('.guided-task').textContent = 'Do this: ' + taskText(problem);

    var textarea = workbench.querySelector('.guided-sql');
    var runButton = workbench.querySelector('.guided-run');
    var hintButton = workbench.querySelector('.guided-hint');
    var nextButton = workbench.querySelector('.guided-next');
    var feedback = workbench.querySelector('.guided-feedback');
    var results = workbench.querySelector('.guided-results');

    textarea.value = savedSql || '';
    textarea.placeholder = expectedSql.split('\n')[0] || 'SELECT ...';

    textarea.addEventListener('input', function() {
      if (store) store.setItem(key, textarea.value);
    });

    textarea.addEventListener('keydown', function(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        runButton.click();
      }
    });

    hintButton.addEventListener('click', function() {
      var hint = problem.querySelector('details.hint');
      if (hint) {
        hint.open = true;
        hint.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      feedback.className = 'guided-feedback warn';
      feedback.textContent = 'Try running what you have first, then compare your SELECT list and WHERE clause to the task.';
    });

    nextButton.addEventListener('click', function() {
      var next = nextProblem(problem);
      if (!next) return;
      next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var nextInput = next.querySelector('.guided-sql');
      if (nextInput) nextInput.focus();
    });

    runButton.addEventListener('click', async function() {
      var sql = textarea.value.trim();
      if (!sql) {
        feedback.className = 'guided-feedback warn';
        feedback.textContent = 'Type your query first, then run the check.';
        results.textContent = '';
        return;
      }

      runButton.disabled = true;
      feedback.className = 'guided-feedback';
      feedback.textContent = 'Running your query and checking it against the lesson answer...';
      results.textContent = '';

      try {
        var response = await fetch('/api/check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            database: database,
            sql: sql,
            expectedSql: expectedSql
          })
        });
        var body = await response.json();

        if (!response.ok) throw body;

        feedback.className = 'guided-feedback' + feedbackClass(body.feedbackType);
        feedback.textContent = body.correct
          ? body.message + ' ' + body.why
          : body.message + ' ' + (body.hint || '');
        renderResultTable(results, body.result);

        if (body.correct) {
          setProblemSolved(problem);
          nextButton.hidden = false;
        }
      } catch (error) {
        feedback.className = 'guided-feedback error';
        feedback.textContent = (error && error.error) ? error.error : 'The checker could not run. Make sure npm start is running.';
      } finally {
        runButton.disabled = false;
      }
    });

    problem.querySelector('.pbody').appendChild(workbench);
  }

  problems.forEach(addWorkbench);
})();

// Local SQL runner. The static curriculum still works without the Node
// server; the runner shows connection status when the API is unavailable.
(function(){
  var header = document.querySelector('header.site');
  if (document.querySelector('.problem')) return;
  if (!header || document.querySelector('.sql-runner')) return;

  var store = null;
  try { store = window.localStorage; }
  catch(e){ store = null; }

  var runner = document.createElement('section');
  runner.className = 'sql-runner';
  runner.setAttribute('aria-label', 'SQL runner');
  runner.innerHTML = [
    '<div class="runner-inner">',
    '  <div class="runner-top">',
    '    <label class="runner-field">Database',
    '      <select id="runner-db"></select>',
    '    </label>',
    '    <button id="runner-run" type="button">Run</button>',
    '    <span id="runner-status" class="runner-status">Connecting...</span>',
    '  </div>',
    '  <textarea id="runner-sql" spellcheck="false" placeholder="SELECT * FROM orders LIMIT 20;"></textarea>',
    '  <div id="runner-results" class="runner-results" aria-live="polite"></div>',
    '</div>'
  ].join('');

  header.insertAdjacentElement('afterend', runner);

  var dbSelect = document.getElementById('runner-db');
  var runButton = document.getElementById('runner-run');
  var sqlInput = document.getElementById('runner-sql');
  var statusEl = document.getElementById('runner-status');
  var resultsEl = document.getElementById('runner-results');
  var displayLimit = 500;

  if (store && store.getItem('sqlm:runner:sql')) {
    sqlInput.value = store.getItem('sqlm:runner:sql');
  }

  function setStatus(message, tone) {
    statusEl.textContent = message;
    statusEl.className = 'runner-status' + (tone ? ' ' + tone : '');
  }

  function saveRunnerState() {
    if (!store) return;
    store.setItem('sqlm:runner:sql', sqlInput.value);
    store.setItem('sqlm:runner:db', dbSelect.value);
  }

  function fillDatabases(databases) {
    var saved = store && store.getItem('sqlm:runner:db');
    dbSelect.textContent = '';
    databases.forEach(function(database) {
      var option = document.createElement('option');
      option.value = database;
      option.textContent = database;
      dbSelect.appendChild(option);
    });
    if (saved && databases.indexOf(saved) !== -1) dbSelect.value = saved;
  }

  function formatCell(value) {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      try { return JSON.stringify(value); }
      catch(e){ return String(value); }
    }
    return String(value);
  }

  function renderMessage(message, tone) {
    resultsEl.textContent = '';
    var empty = document.createElement('div');
    empty.className = 'runner-empty' + (tone ? ' ' + tone : '');
    empty.textContent = message;
    resultsEl.appendChild(empty);
  }

  function renderResults(result) {
    resultsEl.textContent = '';

    if (!result.columns || result.columns.length === 0) {
      renderMessage(result.command + ' affected ' + result.rowCount + ' row(s).', 'ok');
      return;
    }

    var table = document.createElement('table');
    table.className = 'runner-table';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    result.columns.forEach(function(column) {
      var th = document.createElement('th');
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    result.rows.slice(0, displayLimit).forEach(function(row) {
      var tr = document.createElement('tr');
      result.columns.forEach(function(column) {
        var td = document.createElement('td');
        var value = formatCell(row[column]);
        td.textContent = value;
        td.title = value;
        if (value === 'NULL') td.className = 'runner-null';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    resultsEl.appendChild(table);

    if (result.rows.length > displayLimit) {
      var note = document.createElement('div');
      note.className = 'runner-note';
      note.textContent = 'Showing first ' + displayLimit + ' of ' + result.rows.length + ' returned row(s).';
      resultsEl.appendChild(note);
    }
  }

  async function loadDatabases() {
    try {
      var response = await fetch('/api/databases');
      if (!response.ok) throw new Error('Database API unavailable.');
      var body = await response.json();
      fillDatabases(body.databases || []);
      runButton.disabled = !dbSelect.options.length;
      setStatus(dbSelect.options.length ? 'Ready' : 'No databases configured', dbSelect.options.length ? 'ok' : 'warn');
    } catch (error) {
      runButton.disabled = true;
      fillDatabases([]);
      setStatus('Start with npm start', 'warn');
      renderMessage('The local query server is not running.', 'warn');
    }
  }

  async function runSql() {
    var sql = sqlInput.value.trim();
    if (!sql) {
      setStatus('SQL is required', 'warn');
      renderMessage('SQL is required.', 'warn');
      return;
    }

    saveRunnerState();
    runButton.disabled = true;
    setStatus('Running...', '');
    renderMessage('Running query...', '');

    try {
      var response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          database: dbSelect.value,
          sql: sql
        })
      });
      var body = await response.json();

      if (!response.ok) {
        throw body;
      }

      renderResults(body);
      setStatus(body.command + ' / ' + body.rowCount + ' row(s) / ' + body.durationMs + ' ms', 'ok');
    } catch (error) {
      var message = error && error.error ? error.error : 'Query failed.';
      setStatus(message, 'error');
      renderMessage(message, 'error');
    } finally {
      runButton.disabled = !dbSelect.options.length;
    }
  }

  runButton.addEventListener('click', runSql);
  dbSelect.addEventListener('change', saveRunnerState);
  sqlInput.addEventListener('input', saveRunnerState);
  sqlInput.addEventListener('keydown', function(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runSql();
    }
  });

  loadDatabases();
})();
