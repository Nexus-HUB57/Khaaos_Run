(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const state = {
    roster: [],
    data: null,
    horizon: 180,
    lineupIds: [],
    search: '',
    effect: 'all',
    viewStart: 0,
    viewSpan: null,
    playhead: 0,
    showAllPairs: false,
    focusedPairKey: '',
    requestId: 0,
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const pairKey = (left, right) => [left, right].sort().join('|');
  const seconds = (value) => `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)} s`;
  const rosterById = () => new Map(state.roster.map((operative) => [operative.id, operative]));

  function setStatus(message, kind = 'info') {
    const status = $('#app-status');
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function renderEmpty(message) {
    $('#timeline-chart').innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    $('#pair-matrix').innerHTML = '<div class="empty-state">Aguardando simulação…</div>';
    $('#composition-list').innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    $('#pair-list').innerHTML = '';
    $('#focused-pair').innerHTML = '<span class="focus-kicker">PAR EM FOCO</span><p>Sem dados para inspecionar.</p>';
  }

  async function loadSimulation() {
    const requestId = ++state.requestId;
    setStatus('Recalculando horários e interseções…');
    $('#refresh-button').disabled = true;
    const params = new URLSearchParams({
      horizon: String(state.horizon),
      lineup: state.lineupIds.join(','),
    });
    try {
      const response = await fetch(`/api/simulation?${params}`, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (requestId !== state.requestId) return;
      if (!response.ok) throw new Error(payload.detail || `Falha da API (${response.status}).`);
      if (payload.timeline.length !== 16 || payload.pairs.length !== 120) {
        throw new Error('A resposta não contém o roster completo ou todas as duplas.');
      }
      state.data = payload;
      state.viewStart = Math.min(state.viewStart, Math.max(0, state.horizon - (state.viewSpan || state.horizon)));
      state.playhead = Math.min(state.playhead, state.horizon);
      render();
      setStatus(`Modelo carregado · ${payload.timeline.length} operativos · ${payload.pairs.length} duplas · horizonte ${state.horizon} s.`, 'success');
    } catch (error) {
      if (requestId !== state.requestId) return;
      state.data = null;
      renderEmpty(error instanceof Error ? error.message : 'Erro inesperado ao calcular a simulação.');
      setStatus(error instanceof Error ? error.message : 'Erro inesperado ao calcular a simulação.', 'error');
    } finally {
      if (requestId === state.requestId) $('#refresh-button').disabled = false;
    }
  }

  async function initialize() {
    try {
      const response = await fetch('/api/roster', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Falha ao carregar o roster (${response.status}).`);
      const payload = await response.json();
      if (payload.count !== 16 || payload.operatives.length !== 16) throw new Error('O roster canônico precisa conter 16 operativos.');
      state.roster = payload.operatives;
      state.lineupIds = payload.defaultLineup.slice(0, 4);
      const effects = [...new Set(state.roster.map((operative) => operative.effect))].sort();
      $('#effect-filter').innerHTML = '<option value="all">Todos os efeitos</option>' + effects.map((effect) => `<option value="${escapeHtml(effect)}">${escapeHtml(effect.replaceAll('_', ' '))}</option>`).join('');
      $('#horizon-range').value = state.horizon;
      $('#horizon-number').value = state.horizon;
      $('#playhead').max = state.horizon;
      await loadSimulation();
    } catch (error) {
      renderEmpty('O roster não foi carregado. Verifique a conexão e tente novamente.');
      setStatus(error instanceof Error ? error.message : 'Não foi possível iniciar o dashboard.', 'error');
    }
  }

  function visibleRoster() {
    const query = state.search.trim().toLocaleLowerCase('pt-BR');
    return state.data.timeline.filter((operative) => {
      const matchesQuery = !query || `${operative.name} ${operative.ability} ${operative.id}`.toLocaleLowerCase('pt-BR').includes(query);
      return matchesQuery && (state.effect === 'all' || operative.effect === state.effect);
    });
  }

  function render() {
    if (!state.data) return;
    renderSummary();
    renderLineup();
    renderTimeline();
    renderMatrix();
    renderComposition();
    renderPairList();
    updateNavigation();
  }

  function renderSummary() {
    const composition = state.data.composition;
    $('#metric-operators').textContent = `${composition.ids.length} / 4`;
    $('#metric-frequency').textContent = `${composition.overlapInstances} · ${composition.frequencyPerMinute.toFixed(2)}/min`;
    $('#metric-covered').textContent = seconds(composition.coveredSeconds);
    $('#metric-coverage-note').textContent = `de ${state.horizon} s · união das janelas`;
    $('#metric-pair-seconds').textContent = seconds(composition.pairSeconds);
  }

  function renderLineup() {
    const map = rosterById();
    $('#lineup-count').textContent = `${state.lineupIds.length} / 4 selecionados`;
    $('#lineup-chips').innerHTML = state.lineupIds.map((id) => {
      const operative = map.get(id);
      if (!operative) return '';
      return `<span class="lineup-chip">${escapeHtml(operative.name)}<button type="button" data-remove-op="${escapeHtml(id)}" aria-label="Remover ${escapeHtml(operative.name)} da composição">×</button></span>`;
    }).join('') || '<span class="selection-count">Selecione ao menos dois operativos</span>';
  }

  function renderTimeline() {
    const rows = visibleRoster();
    const chart = $('#timeline-chart');
    const viewSpan = Math.min(state.viewSpan || state.horizon, state.horizon);
    const viewStart = Math.max(0, Math.min(state.viewStart, state.horizon - viewSpan));
    const viewEnd = viewStart + viewSpan;
    const left = 180;
    const plotWidth = 890;
    const width = left + plotWidth + 16;
    const top = 34;
    const rowHeight = 42;
    const height = top + rows.length * rowHeight + 12;
    const xFor = (time) => left + ((time - viewStart) / viewSpan) * plotWidth;
    const formatTick = (value) => `${Math.round(value)}s`;
    let svg = `<svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Janelas de habilidade e cooldown dos ${rows.length} operativos filtrados, entre ${viewStart} e ${viewEnd} segundos">`;

    const tickStep = viewSpan <= 60 ? 10 : viewSpan <= 180 ? 30 : viewSpan <= 360 ? 60 : 120;
    const firstTick = Math.ceil(viewStart / tickStep) * tickStep;
    for (let tick = firstTick; tick <= viewEnd; tick += tickStep) {
      const x = xFor(tick);
      svg += `<line class="grid-line${tick % (tickStep * 2) === 0 ? ' major' : ''}" x1="${x}" y1="20" x2="${x}" y2="${height - 5}"/>`;
      svg += `<text class="tick-label" x="${x + 3}" y="14">${formatTick(tick)}</text>`;
    }

    rows.forEach((operative, index) => {
      const y = top + index * rowHeight;
      const selected = state.lineupIds.includes(operative.id);
      const scheduleDescription = `${operative.name}, ${operative.ability}; cooldown ${operative.cooldownSeconds} segundos; duração ${operative.durationSeconds} segundos; janela efetiva ${operative.interactionWindowSeconds} segundos; ${operative.activations.length} ativações no horizonte.`;
      svg += `<g class="operative-row" data-op="${escapeHtml(operative.id)}" role="button" tabindex="0" aria-label="${escapeHtml(scheduleDescription)} ${selected ? 'Remover da' : 'Adicionar à'} composição" aria-pressed="${selected}">`;
      svg += `<rect class="row-bg${selected ? ' selected' : ''}" x="0" y="${y}" width="${width}" height="${rowHeight - 1}"/>`;
      if (selected) svg += `<rect class="row-selected-mark" x="0" y="${y}" width="3" height="${rowHeight - 1}"/>`;
      svg += `<text class="row-name" x="10" y="${y + 17}">${escapeHtml(operative.name)}</text>`;
      svg += `<text class="ability-label" x="10" y="${y + 31}">${escapeHtml(operative.ability)}</text>`;
      svg += `<text class="row-meta" x="${width - 7}" y="${y + 16}" text-anchor="end">CD ${operative.cooldownSeconds}s</text>`;

      for (const activation of operative.activations) {
        const cast = activation.atSeconds;
        const cooldownEnd = activation.cooldownEndSeconds;
        const cdLeft = Math.max(cast, viewStart);
        const cdRight = Math.min(cooldownEnd, viewEnd);
        if (cdRight > cdLeft) {
          const x = xFor(cdLeft), w = Math.max(1, xFor(cdRight) - x);
          const label = `${operative.name}: indisponível após ativação; pronto novamente em ${cooldownEnd} segundos`;
          svg += `<rect class="cooldown-band" x="${x}" y="${y + 32}" width="${w}" height="5" rx="1" tabindex="0" focusable="true" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title></rect>`;
        }
        const stateEnd = activation.stateEndSeconds;
        const effectEnd = activation.effectEndSeconds;
        const stateLeft = Math.max(cast, viewStart), stateRight = Math.min(stateEnd, viewEnd);
        if (stateRight > stateLeft && stateEnd > effectEnd) {
          const x = xFor(stateLeft), w = Math.max(2, xFor(stateRight) - x);
          const label = `${operative.name}: estado da habilidade por ${operative.durationSeconds} segundos; efeito efetivo por ${operative.interactionWindowSeconds} segundos`;
          svg += `<rect class="state-shell" x="${x}" y="${y + 9}" width="${w}" height="12" rx="2" tabindex="0" focusable="true" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title></rect>`;
        }
        const effectLeft = Math.max(cast, viewStart), effectRight = Math.min(effectEnd, viewEnd);
        if (effectRight > effectLeft) {
          const x = xFor(effectLeft), w = Math.max(2, xFor(effectRight) - x);
          const analytic = activation.isAnalyticSignal;
          const cls = analytic ? 'signal-band' : 'effect-band';
          const label = analytic ? 'janela analítica; não é duração de gameplay' : `efeito efetivo por ${operative.interactionWindowSeconds} segundos`;
          const title = `${operative.name}: ${label}, de ${cast} a ${effectEnd} segundos`;
          svg += `<rect class="${cls}" x="${x}" y="${y + 9}" width="${w}" height="12" rx="2" tabindex="0" focusable="true" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title></rect>`;
        }
        if (cast >= viewStart && cast <= viewEnd) {
          const x = xFor(cast);
          svg += `<line class="cast-line" x1="${x}" y1="${y + 6}" x2="${x}" y2="${y + 38}"/>`;
          if (activation.isInstantEvent) {
            const label = `${operative.ability}: evento instantâneo em ${cast} segundos`;
            svg += `<circle class="event-dot" cx="${x}" cy="${y + 15}" r="4" tabindex="0" focusable="true" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title></circle>`;
          }
        }
      }
      svg += '</g>';
    });
    if (!rows.length) {
      chart.innerHTML = '<div class="empty-state">Nenhum operativo corresponde aos filtros atuais.</div>';
      return;
    }
    if (state.playhead >= viewStart && state.playhead <= viewEnd) {
      const x = xFor(state.playhead);
      svg += `<line class="playhead-line" x1="${x}" y1="18" x2="${x}" y2="${height - 4}"/>`;
    }
    svg += '</svg>';
    chart.innerHTML = svg;
    $('#roster-count').textContent = `${rows.length} / 16 FAIXAS`;
    $('#visible-window').textContent = `${viewStart}—${viewEnd} s`;
  }

  function renderMatrix() {
    const map = new Map(state.data.pairs.map((pair) => [pairKey(pair.leftId, pair.rightId), pair]));
    const max = Math.max(1, ...state.data.pairs.map((pair) => pair.pairSeconds));
    const visible = state.showAllPairs ? state.data.pairs : state.data.composition.synergies;
    const active = new Set(visible.map((pair) => pairKey(pair.leftId, pair.rightId)));
    const names = state.data.timeline;
    let html = '<table class="matrix-table"><caption class="visually-hidden">Matriz de pair-seconds das duplas de operativos</caption><thead><tr><th scope="col">OPERATIVO</th>';
    names.forEach((operative) => { html += `<th scope="col" title="${escapeHtml(operative.name)}">${escapeHtml(operative.name.split(' ')[0])}</th>`; });
    html += '</tr></thead><tbody>';
    names.forEach((row, i) => {
      html += `<tr><th scope="row" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</th>`;
      names.forEach((column, j) => {
        if (i === j) { html += '<td class="matrix-diagonal" aria-hidden="true">·</td>'; return; }
        const pair = map.get(pairKey(row.id, column.id));
        const selected = active.has(pairKey(row.id, column.id));
        const heat = pair && pair.pairSeconds > 0 ? Math.max(.12, pair.pairSeconds / max) : 0;
        const classes = `matrix-cell${heat ? ' has-overlap' : ''}${state.focusedPairKey === pairKey(row.id, column.id) ? ' selected' : ''}`;
        const label = `${row.name} + ${column.name}: ${pair.pairSeconds.toFixed(1)} pair-seconds; ${pair.overlapInstances} overlap occurrences`;
        html += `<td><button type="button" class="${classes}" data-pair-key="${escapeHtml(pairKey(row.id, column.id))}" style="--heat:${heat.toFixed(3)}" aria-label="${escapeHtml(label)}"${selected ? ' data-in-composition="true"' : ''}></button></td>`;
      });
      html += '</tr>';
    });
    $('#pair-matrix').innerHTML = `${html}</tbody></table>`;
    $('#pair-mode-toggle').textContent = state.showAllPairs ? 'MOSTRAR COMPOSIÇÃO' : 'EXIBIR TODOS OS 120 PARES';
    $('#pair-mode-toggle').setAttribute('aria-pressed', String(state.showAllPairs));
    renderFocusedPair();
  }

  function renderFocusedPair() {
    const focus = $('#focused-pair');
    if (!state.focusedPairKey) {
      focus.innerHTML = '<span class="focus-kicker">PAR EM FOCO</span><p>Selecione uma célula para inspecionar a combinação.</p>';
      return;
    }
    const pair = state.data.pairs.find((item) => pairKey(item.leftId, item.rightId) === state.focusedPairKey);
    if (!pair) return;
    const details = pair.synergies.length
      ? pair.synergies.map((item) => `<p><strong>${escapeHtml(item.label)}</strong> · ${item.pairSeconds.toFixed(1)} pair-s · ${item.overlapInstances} ocorrências<br>${escapeHtml(item.rationale)}</p>`).join('')
      : '<p>Não há regra de sinergia cadastrada para esta dupla.</p>';
    focus.innerHTML = `<span class="focus-kicker">PAR EM FOCO</span><p><strong>${escapeHtml(pair.leftName)} + ${escapeHtml(pair.rightName)}</strong><br>${pair.coveredSeconds.toFixed(1)} s cobertos · ${pair.pairSeconds.toFixed(1)} pair-s · ${pair.overlapInstances} ocorrências</p>${details}`;
  }

  function renderComposition() {
    const composition = state.data.composition;
    if (composition.ids.length < 2) {
      $('#composition-list').innerHTML = '<div class="empty-state">Selecione de 2 a 4 operativos para calcular sobreposições.</div>';
      return;
    }
    const rows = composition.ids.map((id) => {
      const operative = state.roster.find((item) => item.id === id);
      return `<div class="operative-card"><span>${escapeHtml(operative.name)}<br><small>${escapeHtml(operative.ability)}</small></span><small>CD ${operative.cooldownSeconds}s · janela ${operative.interactionWindowSeconds}s</small></div>`;
    }).join('');
    $('#composition-list').innerHTML = rows || '<div class="empty-state">Selecione operativos.</div>';
  }

  function renderPairList() {
    const pairs = state.showAllPairs
      ? state.data.pairs
      : state.data.composition.synergies;
    if (!pairs.length) {
      $('#pair-list').innerHTML = '<div class="empty-state">Nenhuma janela de sinergia nessa composição e horizonte.</div>';
      return;
    }
    const ordered = [...pairs].sort((a, b) => b.pairSeconds - a.pairSeconds || a.leftName.localeCompare(b.leftName));
    $('#pair-list').innerHTML = ordered.map((pair) => {
      const labels = pair.synergies.length
        ? pair.synergies.map((item) => `<p>${escapeHtml(item.label)} · ${item.pairSeconds.toFixed(1)} pair-s · ${item.overlapInstances} ocorrências</p>`).join('')
        : '<p>Sem regra de sinergia com overlap no horizonte.</p>';
      return `<article class="pair-card"><h4>${escapeHtml(pair.leftName)} + ${escapeHtml(pair.rightName)}</h4><p class="pair-metric">${pair.pairSeconds.toFixed(1)} pair-s · ${pair.coveredSeconds.toFixed(1)} s únicos · ${pair.overlapInstances} ocorrências</p>${labels}</article>`;
    }).join('');
  }

  function updateNavigation() {
    const maxStart = Math.max(0, state.horizon - Math.min(state.viewSpan || state.horizon, state.horizon));
    $('#window-start').max = maxStart;
    $('#window-start').value = Math.min(state.viewStart, maxStart);
    $('#window-start-value').textContent = `${Math.min(state.viewStart, maxStart)} s`;
    $('#playhead').max = state.horizon;
    $('#playhead').value = state.playhead;
    $('#playhead-value').textContent = `T+ ${state.playhead} s`;
    $('#horizon-value').textContent = `${state.horizon} s`;
  }

  function toggleOperative(id) {
    if (state.lineupIds.includes(id)) {
      if (state.lineupIds.length <= 2) { setStatus('A composição precisa manter ao menos dois operativos.', 'error'); return; }
      state.lineupIds = state.lineupIds.filter((item) => item !== id);
    } else {
      if (state.lineupIds.length >= 4) { setStatus('O limite de composição é quatro operativos.', 'error'); return; }
      state.lineupIds = [...state.lineupIds, id];
    }
    loadSimulation();
  }

  function setHorizon(value) {
    const parsed = Math.max(60, Math.min(600, Math.round(Number(value) / 30) * 30));
    state.horizon = parsed;
    if ($('#view-span').value === 'full') state.viewSpan = null;
    $('#horizon-range').value = parsed;
    $('#horizon-number').value = parsed;
    state.viewStart = Math.min(state.viewStart, Math.max(0, parsed - (state.viewSpan || parsed)));
    state.playhead = Math.min(state.playhead, parsed);
    loadSimulation();
  }

  $('#horizon-range').addEventListener('input', (event) => setHorizon(event.target.value));
  $('#horizon-number').addEventListener('change', (event) => setHorizon(event.target.value));
  $('#refresh-button').addEventListener('click', loadSimulation);
  $('#operative-search').addEventListener('input', (event) => { state.search = event.target.value; renderTimeline(); });
  $('#effect-filter').addEventListener('change', (event) => { state.effect = event.target.value; renderTimeline(); });
  $('#view-span').addEventListener('change', (event) => {
    state.viewSpan = event.target.value === 'full' ? null : Number(event.target.value);
    state.viewStart = Math.min(state.viewStart, Math.max(0, state.horizon - (state.viewSpan || state.horizon)));
    renderTimeline(); updateNavigation();
  });
  $('#view-prev').addEventListener('click', () => { state.viewStart = Math.max(0, state.viewStart - Math.max(15, (state.viewSpan || state.horizon) / 2)); renderTimeline(); updateNavigation(); });
  $('#view-next').addEventListener('click', () => { state.viewStart = Math.min(state.horizon - Math.min(state.viewSpan || state.horizon, state.horizon), state.viewStart + Math.max(15, (state.viewSpan || state.horizon) / 2)); renderTimeline(); updateNavigation(); });
  $('#window-start').addEventListener('input', (event) => { state.viewStart = Number(event.target.value); renderTimeline(); updateNavigation(); });
  $('#playhead').addEventListener('input', (event) => { state.playhead = Number(event.target.value); renderTimeline(); updateNavigation(); });
  $('#pair-mode-toggle').addEventListener('click', () => { state.showAllPairs = !state.showAllPairs; renderMatrix(); renderPairList(); });
  $('#lineup-chips').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-op]');
    if (button) toggleOperative(button.dataset.removeOp);
  });
  $('#timeline-chart').addEventListener('click', (event) => {
    const row = event.target.closest('[data-op]');
    if (row) toggleOperative(row.dataset.op);
  });
  $('#timeline-chart').addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-op]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleOperative(row.dataset.op); }
  });
  $('#pair-matrix').addEventListener('click', (event) => {
    const cell = event.target.closest('[data-pair-key]');
    if (!cell) return;
    state.focusedPairKey = cell.dataset.pairKey;
    renderMatrix();
    renderFocusedPair();
  });

  initialize();
})();
