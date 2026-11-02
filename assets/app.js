/* Scenario source text is immutable; only results and comments are saved. */
(() => {
  'use strict';
  const data = window.UAT_DATA;
  const scenarios = data.scenarios;
  const outcomes = ['Pass', 'Fail', 'Partially Passed'];
  const $ = id => document.getElementById(id);
  const namespace = `appreg-uat:${data.version}:`;
  const assignments = window.UAT_ALLOCATIONS.assignments;
  const completerKey = namespace + 'completing-tester';
  const results = new Map();
  let selected = scenarios[0].id;
  let filtered = scenarios;
  let exporting = false;
  let storageFailed = false;
  function storageWarning(message) {
    storageFailed = true;
    $('storage-warning').textContent = message + ' Keep this page open and download your completed results as a PDF.';
    $('storage-warning').hidden = false;
    $('save-state').textContent = 'Changes are held in this page only.';
  }
  for (const scenario of scenarios) {
    let result = { outcome: '', comments: '' };
    try {
      const raw = localStorage.getItem(namespace + scenario.id);
      if (raw) {
        const stored = JSON.parse(raw);
        if (!stored || typeof stored !== 'object' || typeof stored.comments !== 'string' || !['', ...outcomes].includes(stored.outcome)) throw new Error('Invalid saved result');
        result = stored;
      }
    } catch (error) {
      storageWarning('Some saved results could not be read, or browser storage is unavailable.');
    }
    results.set(scenario.id, result);
  }
  for (const suite of [...new Set(scenarios.map(s => s.suite))]) {
    const option = document.createElement('option');
    option.value = suite; option.textContent = suite; $('suite').append(option);
  }
  function assignedTester(scenario) { return String(assignments[scenario.id] || '').trim() || 'Unassigned'; }
  const testerNames = [...new Set(Object.values(assignments).map(value => String(value || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  for (const name of testerNames) {
    const option = document.createElement('option'); option.value = 'tester:' + name; option.textContent = name; $('tester').append(option);
  }
  const unassignedOption = document.createElement('option'); unassignedOption.value = '__unassigned__'; unassignedOption.textContent = 'Unassigned'; $('tester').append(unassignedOption);
  try { $('completing-tester').value = localStorage.getItem(completerKey) || ''; }
  catch (error) { storageWarning('Browser storage is unavailable.'); }
  function testerScope() {
    const tester = $('tester').value;
    return scenarios.filter(s => !tester || (tester === '__unassigned__' ? !String(assignments[s.id] || '').trim() : assignedTester(s) === tester.slice(7)));
  }
  function selectionLabel() { return $('tester').selectedOptions[0].textContent; }
  function status(id) { return results.get(id).outcome || 'Not Started'; }
  function statusClass(value) { return ({Pass: 'pass', Fail: 'fail', 'Partially Passed': 'partial'})[value] || 'not-started'; }
  function save() {
    const result = results.get(selected);
    const name = $('completing-tester').value.trim();
    if (name) result.completedBy = name;
    try {
      localStorage.setItem(namespace + selected, JSON.stringify(result));
      if (!storageFailed) $('save-state').textContent = 'Saved in this browser · ' + new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
    } catch (error) { storageWarning('Browser storage is unavailable or full.'); }
    updateProgress();
  }
  function updateProgress() {
    const scope = testerScope();
    const counts = Object.fromEntries(outcomes.map(o => [o, scope.filter(s => results.get(s.id).outcome === o).length]));
    const completed = Object.values(counts).reduce((a,b) => a+b, 0);
    $('completed-count').textContent = completed;
    $('progress').value = completed;
    $('progress').max = scope.length || 1;
    $('progress').setAttribute('aria-label', `Completed scenarios: ${completed} of ${scope.length}`);
    $('total-copy').textContent = `of ${scope.length} scenarios completed`;
    $('run-label').textContent = $('tester').value ? `TEST RUN · ${selectionLabel()}` : 'YOUR TEST RUN · ALL SCENARIOS';
    $('pdf-scope').textContent = $('tester').value ? `PDF includes completed scenarios for ${selectionLabel()} across all suites.` : 'PDF includes completed scenarios across all suites.';
    $('pass-count').textContent = counts.Pass;
    $('fail-count').textContent = counts.Fail;
    $('partial-count').textContent = counts['Partially Passed'];
    $('download').disabled = completed === 0 || exporting;
  }
  function renderList() {
    const search = $('search').value.toLocaleLowerCase().trim();
    const suite = $('suite').value, outcome = $('outcome-filter').value;
    const scope = testerScope();
    filtered = scope.filter(s => (!suite || suite === s.suite) && (!outcome || status(s.id) === outcome) && (!search || [s.caseKey,s.scenarioId,s.title,s.goal,s.preconditions,s.steps,s.expected].join('\n').toLocaleLowerCase().includes(search)));
    $('clear-filters').hidden = !search && !suite && !outcome;
    $('visible-count').textContent = `${filtered.length} / ${scope.length}`;
    $('no-matches').hidden = filtered.length > 0;
    if (!filtered.some(s => s.id === selected)) selected = filtered[0]?.id || null;
    const fragment = document.createDocumentFragment();
    for (const scenario of filtered) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'scenario-card'; button.dataset.id = scenario.id;
      button.setAttribute('aria-current', String(scenario.id === selected));
      const code = document.createElement('span'); code.className = 'card-code'; code.textContent = scenario.scenarioId;
      const title = document.createElement('span'); title.className = 'card-title'; title.textContent = scenario.title;
      const assignee = document.createElement('span'); assignee.className = 'card-assignee'; assignee.textContent = 'Assigned Tester: ' + assignedTester(scenario);
      const summary = document.createElement('span'); summary.className = 'card-status ' + statusClass(status(scenario.id)); summary.textContent = status(scenario.id);
      if (results.get(scenario.id).comments) { const note = document.createElement('small'); note.textContent = 'Has comments'; summary.append(note); }
      button.append(code, title, assignee, summary);
      button.addEventListener('click', () => { selected = scenario.id; renderList(); renderDetail(true); });
      fragment.append(button);
    }
    $('scenario-list').replaceChildren(fragment);
  }
  function renderDetail(focus = false) {
    const scenario = scenarios.find(s => s.id === selected);
    $('scenario').hidden = !scenario;
    $('empty-detail').hidden = Boolean(scenario);
    if (!scenario) return;
    const index = filtered.findIndex(s => s.id === selected);
    $('position').textContent = `Scenario ${index + 1} of ${filtered.length}${filtered.length !== scenarios.length ? ' matching scenarios' : ''}`;
    for (const [id, field] of Object.entries({'suite-label':'suite', 'scenario-code':'scenarioId', 'scenario-heading':'title', 'case-key':'caseKey', history:'history', goal:'goal', preconditions:'preconditions', steps:'steps', expected:'expected'})) $(id).textContent = scenario[field] || '';
    $('history').textContent = scenario.history === 'Previously tested' ? 'Previously tested · history only' : scenario.history;
    $('source-reference').textContent = `Workbook: ${data.sheet}, row ${scenario.sourceRow}`;
    const result = results.get(selected);
    $('assigned-tester').textContent = assignedTester(scenario);
    $('completed-by').textContent = result.completedBy || 'Not recorded';
    for (const input of document.querySelectorAll('input[name=result]')) input.checked = input.value === result.outcome;
    $('comments').value = result.comments;
    $('clear-result').disabled = !result.outcome;
    $('previous').disabled = index === 0;
    $('next').disabled = index === filtered.length - 1;
    if (focus) $('scenario-heading').focus({preventScroll: false});
  }
  for (const id of ['search','suite','outcome-filter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {renderList();renderDetail();});
  $('tester').addEventListener('change', () => {updateProgress();renderList();renderDetail();});
  $('completing-tester').addEventListener('input', () => {
    try { localStorage.setItem(completerKey, $('completing-tester').value); }
    catch (error) {storageWarning('Browser storage is unavailable or full.');}
  });
  $('clear-filters').addEventListener('click', () => {for(const id of ['search','suite','outcome-filter']) $(id).value='';renderList();renderDetail();});
  for (const [id, delta] of [['previous',-1], ['next',1]]) $(id).addEventListener('click', () => {
    const index = filtered.findIndex(s => s.id === selected) + delta;
    if (filtered[index]) {selected=filtered[index].id;renderList();renderDetail(true);document.querySelector('.scenario-card[aria-current=true]')?.scrollIntoView({block:'nearest'});}
  });
  document.querySelectorAll('input[name=result]').forEach(input => input.addEventListener('change', () => {results.get(selected).outcome=input.value;save();renderList();renderDetail();}));
  $('comments').addEventListener('input', () => {results.get(selected).comments=$('comments').value;save();$('completed-by').textContent=results.get(selected).completedBy || 'Not recorded';renderList();});
  $('clear-result').addEventListener('click', () => {results.get(selected).outcome='';save();renderList();renderDetail();});
  $('download').addEventListener('click', async () => {
    exporting = true; updateProgress(); $('export-message').hidden = false; $('export-message').textContent = 'Preparing your PDF…';
    try {
      const scope = testerScope();
      const snapshot = scope.filter(s => results.get(s.id).outcome).map(s => ({...s, assignedTester:assignedTester(s), result:{...results.get(s.id)}}));
      const bytes = await window.createResultsPdf(data, snapshot, {total:scope.length, selection:selectionLabel(), completingTester:$('completing-tester').value.trim()});
      const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
      const link = document.createElement('a'); link.href=url; link.download=`application-register-uat-results-${new Date().toISOString().replace(/[:.]/g,'-')}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('export-message').textContent = `PDF downloaded with ${snapshot.length} completed scenarios.`;
    } catch (error) { console.error(error); $('export-message').textContent = 'The PDF could not be generated. Your results are still available. Please try again.'; }
    finally {exporting=false;updateProgress();}
  });
  updateProgress();renderList();renderDetail();
})();
