/* ===== ČOVJEČE LIGA - app.js (Google Sheets verzija) ===== */

// =====================
// CONFIG
// =====================
const API_URL = 'https://script.google.com/macros/s/AKfycbzprb801V4E48cTdSt4db8eCeAqIPnZTsI02N2zBR30dBiCazdaGDRLilj_IEBsn6k/exec';

// =====================
// STATE
// =====================
let state = {
  leagueName: 'Čovječe Liga',
  players: [],
  rounds: []
};
let isSaving = false;
let autoRefreshInterval = null;

// =====================
// API
// =====================
async function apiLoad() {
  const res = await fetch(API_URL + '?action=load');
  if (!res.ok) throw new Error('Greška pri učitavanju');
  return await res.json();
}

async function apiSave(data) {
  const res = await fetch(API_URL + '?action=save', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Greška pri spremanju');
  return await res.json();
}

async function loadFromCloud() {
  showSyncStatus('⏳ Učitavanje...');
  try {
    const data = await apiLoad();
    if (data.error) throw new Error(data.error);
    state = { ...state, ...data };
    renderCurrentView();
    showSyncStatus('✅ Sinkronizirano');
  } catch(e) {
    showSyncStatus('❌ Greška: ' + e.message, true);
  }
}

async function saveToCloud() {
  if (isSaving) return;
  isSaving = true;
  showSyncStatus('💾 Spremanje...');
  try {
    const result = await apiSave(state);
    if (!result.ok) throw new Error('Nije spremljeno');
    showSyncStatus('✅ Spremljeno');
  } catch(e) {
    showSyncStatus('❌ Greška pri spremanju', true);
    showToast('Greška pri spremanju: ' + e.message, true);
  } finally {
    isSaving = false;
  }
}

function showSyncStatus(msg, isError = false) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--ghost-red)' : 'var(--neon-blue)';
}

let currentView = 'tablica';
function renderCurrentView() {
  if (currentView === 'tablica') renderTable();
  else if (currentView === 'povijest') renderPovijest();
  else if (currentView === 'igraci') renderPlayers();
  else if (currentView === 'postavke') renderPostavke();
}

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(loadFromCloud, 30000); // every 30s
}

// =====================
// STATS HELPERS
// =====================
function computePlayerStats(playerId) {
  const s = {
    partije: 0, bodovi: 0,
    p1: 0, p2: 0, p3: 0, drekovi: 0, muhe: 0,
    kola: 0, plasmani: []
  };
  const kolaSet = new Set();
  for (const round of state.rounds) {
    let playedThisRound = false;
    for (const game of round.games) {
      if (!game) continue;
      let place = null, m = 0;
      if (game.p1 === playerId) { place = 1; }
      else if (game.p2 === playerId) { place = 2; }
      else if (game.p3 === playerId) { place = 3; }
      else if (game.drek === playerId) { place = 4; m = game.muhe || 0; }
      if (place !== null) {
        s.partije++;
        s.bodovi += place;
        if (place === 1) s.p1++;
        else if (place === 2) s.p2++;
        else if (place === 3) s.p3++;
        else { s.drekovi++; s.muhe += m; }
        s.plasmani.push(place);
        playedThisRound = true;
      }
    }
    if (playedThisRound) kolaSet.add(round.id);
  }
  s.kola = kolaSet.size;
  s.rez = s.partije > 0 ? (s.bodovi / s.partije) : null;
  const totalPossible = state.rounds.length * 4;
  s.pct = totalPossible > 0 ? Math.round((s.partije / totalPossible) * 100) : 0;
  return s;
}

function getTitle(stats) {
  if (stats.partije === 0) return '';
  if (stats.rez !== null && stats.rez <= 1.5) return '👑';
  if (stats.p1 >= 5) return '🏆';
  if (stats.drekovi >= 5) return '💩';
  if (stats.muhe >= 10) return '🪰';
  return '';
}

function sortedPlayers() {
  return [...state.players].map(p => ({
    ...p,
    stats: computePlayerStats(p.id)
  })).sort((a, b) => {
    const as = a.stats, bs = b.stats;
    if (as.partije === 0 && bs.partije === 0) return 0;
    if (as.partije === 0) return 1;
    if (bs.partije === 0) return -1;
    if (as.rez !== bs.rez) return as.rez - bs.rez;
    if (as.p1 !== bs.p1) return bs.p1 - as.p1;
    if (as.drekovi !== bs.drekovi) return as.drekovi - bs.drekovi;
    if (as.muhe !== bs.muhe) return as.muhe - bs.muhe;
    return bs.partije - as.partije;
  });
}

// =====================
// VIEWS
// =====================
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');
  const btn = document.querySelector(`[data-view="${name}"]`);
  if (btn) btn.classList.add('active');
  if (name === 'tablica') renderTable();
  if (name === 'novo-kolo') renderRoundForm();
  if (name === 'povijest') renderPovijest();
  if (name === 'igraci') renderPlayers();
  if (name === 'postavke') renderPostavke();
}

// =====================
// TABLICA
// =====================
function renderTable() {
  const body = document.getElementById('ligaTableBody');
  const empty = document.getElementById('tablicaEmpty');
  const wrap = document.querySelector('.table-wrap');
  const leagueNameEl = document.getElementById('leagueName');
  if (leagueNameEl) leagueNameEl.textContent = state.leagueName || '';

  if (state.players.length === 0) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  empty.style.display = 'none';

  if (state.rounds.length > 0) rebuildHistoryHeaders();

  const players = sortedPlayers();
  body.innerHTML = '';

  players.forEach((p, idx) => {
    const s = p.stats;
    const rank = idx + 1;
    let rezClass = '';
    if (s.rez !== null) {
      if (s.rez <= 2) rezClass = 'rez-good';
      else if (s.rez <= 3) rezClass = 'rez-mid';
      else rezClass = 'rez-bad';
    }

    let histCells = '';
    state.rounds.forEach(round => {
      let place = null;
      for (const game of round.games) {
        if (!game) continue;
        if (game.p1 === p.id) { place = 1; break; }
        if (game.p2 === p.id) { place = 2; break; }
        if (game.p3 === p.id) { place = 3; break; }
        if (game.drek === p.id) { place = 4; break; }
      }
      if (place === 1) histCells += `<td class="hist-cell hist-1">1</td>`;
      else if (place === 2) histCells += `<td class="hist-cell hist-2">2</td>`;
      else if (place === 3) histCells += `<td class="hist-cell hist-3">3</td>`;
      else if (place === 4) histCells += `<td class="hist-cell hist-drek">💩</td>`;
      else histCells += `<td class="hist-cell hist-empty"></td>`;
    });

    const tr = document.createElement('tr');
    tr.dataset.playerId = p.id;
    tr.addEventListener('click', () => openPlayerModal(p.id));
    tr.innerHTML = `
      <td class="col-rank sticky-col"><span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank}</span></td>
      <td class="col-name sticky-col2">
        <div class="player-name-cell">
          <span class="player-dot ${p.color}"></span>
          <span>${escHtml(p.name)}</span>
        </div>
      </td>
      <td class="col-title"><span class="title-badge">${getTitle(s)}</span></td>
      <td class="col-num">${s.kola}</td>
      <td class="col-num">${s.partije}</td>
      <td class="col-num">${s.pct}%</td>
      <td class="col-num">${s.bodovi}</td>
      <td class="col-rez ${rezClass}">${s.rez !== null ? s.rez.toFixed(2) : '—'}</td>
      <td class="col-num">${s.p1}</td>
      <td class="col-num">${s.p2}</td>
      <td class="col-num">${s.p3}</td>
      <td class="col-num">${s.drekovi}</td>
      <td class="col-num">${s.muhe}</td>
      ${histCells}
    `;
    body.appendChild(tr);
  });
}

function rebuildHistoryHeaders() {
  const table = document.getElementById('ligaTable');
  const thead = table.querySelector('thead');
  const headerRow = thead.querySelector('tr');
  const allTh = headerRow.querySelectorAll('th');
  for (let i = allTh.length - 1; i >= 13; i--) allTh[i].remove();
  state.rounds.forEach((round, i) => {
    const th = document.createElement('th');
    th.className = 'hist-cell hist-label';
    th.title = round.name || `Kolo ${i + 1}`;
    th.textContent = `K${i + 1}`;
    headerRow.appendChild(th);
  });
}

// =====================
// ROUND FORM
// =====================
function renderRoundForm() {
  const wrap = document.getElementById('roundFormWrap');
  const noMsg = document.getElementById('noPlayersMsg');
  if (state.players.length < 4) {
    wrap.style.display = 'none';
    noMsg.style.display = 'block';
    return;
  }
  wrap.style.display = 'flex';
  noMsg.style.display = 'none';

  const dateInput = document.getElementById('newRoundDate');
  if (!dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
  const nameInput = document.getElementById('newRoundName');
  if (!nameInput.value) nameInput.value = `Kolo ${state.rounds.length + 1}`;

  const container = document.getElementById('partijeForms');
  container.innerHTML = '';
  for (let i = 1; i <= 4; i++) container.appendChild(buildPartijaCard(i));
}

function buildPartijaCard(num) {
  const card = document.createElement('div');
  card.className = 'partija-card';
  card.id = `partija-${num}`;
  const opts = state.players.map(p =>
    `<option value="${p.id}">${escHtml(p.name)}</option>`
  ).join('');
  const emptyOpt = `<option value="">-- odaberi --</option>`;
  card.innerHTML = `
    <div class="partija-header">
      <span class="partija-num">PARTIJA ${num}</span>
    </div>
    <div class="partija-grid">
      <div class="form-group">
        <label>🥇 1. mjesto</label>
        <select class="form-input sel-p1" data-partija="${num}">${emptyOpt}${opts}</select>
      </div>
      <div class="form-group">
        <label>🥈 2. mjesto</label>
        <select class="form-input sel-p2" data-partija="${num}">${emptyOpt}${opts}</select>
      </div>
      <div class="form-group">
        <label>🥉 3. mjesto</label>
        <select class="form-input sel-p3" data-partija="${num}">${emptyOpt}${opts}</select>
      </div>
      <div class="form-group">
        <label>💩 Drek (zadnji)</label>
        <select class="form-input sel-drek" data-partija="${num}">${emptyOpt}${opts}</select>
      </div>
      <div class="partija-drek-row">
        <div class="form-group" style="margin:0">
          <label>🪰 Broj muha</label>
          <select class="form-input sel-muhe" data-partija="${num}">
            <option value="0">0 muha</option>
            <option value="1">1 muha</option>
            <option value="2">2 muhe</option>
            <option value="3">3 muhe</option>
            <option value="4">4 muhe</option>
          </select>
        </div>
      </div>
    </div>
  `;
  return card;
}

function collectRoundData() {
  const date = document.getElementById('newRoundDate').value;
  const name = document.getElementById('newRoundName').value.trim();
  const games = [];
  const errors = [];
  for (let i = 1; i <= 4; i++) {
    const card = document.getElementById(`partija-${i}`);
    if (!card) continue;
    const p1 = card.querySelector('.sel-p1').value;
    const p2 = card.querySelector('.sel-p2').value;
    const p3 = card.querySelector('.sel-p3').value;
    const drek = card.querySelector('.sel-drek').value;
    const muhe = parseInt(card.querySelector('.sel-muhe').value) || 0;
    if (!p1 || !p2 || !p3 || !drek) { errors.push(`Partija ${i}: popuni sva mjesta`); continue; }
    if (new Set([p1,p2,p3,drek]).size !== 4) { errors.push(`Partija ${i}: isti igrač ne može biti na više mjesta`); continue; }
    games.push({ p1, p2, p3, drek, muhe });
  }
  if (games.length !== 4) return { ok: false, errors };
  return { ok: true, round: { id: Date.now().toString(), date, name, games } };
}

// =====================
// POVIJEST
// =====================
function renderPovijest() {
  const list = document.getElementById('povijestList');
  const empty = document.getElementById('povijestEmpty');
  if (state.rounds.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = '';
  const reversed = [...state.rounds].reverse();
  reversed.forEach((round) => {
    const realIdx = state.rounds.indexOf(round);
    const card = document.createElement('div');
    card.className = 'kolo-card';
    const fmtDate = round.date ? formatDate(round.date) : '';
    const roundNum = realIdx + 1;
    const roundName = round.name || `Kolo ${roundNum}`;
    let gamesHtml = '';
    round.games.forEach((game, gi) => {
      const getN = id => {
        const p = state.players.find(x => x.id === id);
        return p ? escHtml(p.name) : '?';
      };
      gamesHtml += `
        <div class="partija-result">
          <div class="partija-result-title">PARTIJA ${gi + 1}</div>
          <div class="result-row"><span class="result-place">🥇</span><span class="result-name">${getN(game.p1)}</span></div>
          <div class="result-row"><span class="result-place">🥈</span><span class="result-name">${getN(game.p2)}</span></div>
          <div class="result-row"><span class="result-place">🥉</span><span class="result-name">${getN(game.p3)}</span></div>
          <div class="result-row">
            <span class="result-place">💩</span>
            <span class="result-name">${getN(game.drek)}</span>
            <span class="result-muhe">${game.muhe > 0 ? `🪰 ${game.muhe}` : ''}</span>
          </div>
        </div>`;
    });
    card.innerHTML = `
      <div class="kolo-header">
        <div>
          <span class="kolo-title">${escHtml(roundName)}</span>
          ${fmtDate ? `<span class="kolo-date"> · ${fmtDate}</span>` : ''}
        </div>
        <div class="kolo-actions">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openEditRound('${round.id}')">✏️ Uredi</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteRound('${round.id}')">🗑️</button>
        </div>
      </div>
      <div class="kolo-body">${gamesHtml}</div>
    `;
    list.appendChild(card);
  });
}

// =====================
// PLAYERS
// =====================
function renderPlayers() {
  const list = document.getElementById('playersList');
  if (state.players.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:.82rem;">Nema igrača. Dodaj prvog igrača!</p>';
    return;
  }
  list.innerHTML = '';
  state.players.forEach(p => {
    const s = computePlayerStats(p.id);
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `
      <span class="player-dot ${p.color}"></span>
      <span class="player-item-name">${escHtml(p.name)}</span>
      <span class="player-item-stats">REZ: ${s.rez !== null ? s.rez.toFixed(2) : '—'} · ${s.partije} partija</span>
      <button class="btn btn-sm btn-danger" onclick="removePlayer('${p.id}')">✕</button>
    `;
    list.appendChild(div);
  });
}

// =====================
// POSTAVKE
// =====================
function renderPostavke() {
  const inp = document.getElementById('leagueNameInput');
  if (inp) inp.value = state.leagueName || '';
}

// =====================
// PLAYER MODAL
// =====================
function openPlayerModal(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;
  const s = computePlayerStats(playerId);
  const rezClass = s.rez !== null ? (s.rez <= 2 ? 'rez-good' : s.rez <= 3 ? 'rez-mid' : 'rez-bad') : '';
  const best = s.plasmani.length > 0 ? Math.min(...s.plasmani) : null;
  const worst = s.plasmani.length > 0 ? Math.max(...s.plasmani) : null;
  const bestStr = best === 1 ? '🥇 1.' : best === 2 ? '🥈 2.' : best === 3 ? '🥉 3.' : best === 4 ? '💩 Drek' : '—';
  const worstStr = worst === 4 ? '💩 Drek' : worst === 3 ? '🥉 3.' : worst === 2 ? '🥈 2.' : worst === 1 ? '🥇 1.' : '—';
  document.getElementById('playerModalContent').innerHTML = `
    <div class="player-modal-header">
      <span class="player-dot ${p.color}" style="width:18px;height:18px;flex-shrink:0;border-radius:50%;background:var(--color-${p.color});box-shadow:0 0 8px var(--color-${p.color});display:inline-block;"></span>
      <span class="player-modal-name">${escHtml(p.name)}</span>
      <span style="margin-left:auto;font-size:1.5rem">${getTitle(s)}</span>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <span class="rez-big ${rezClass}">${s.rez !== null ? s.rez.toFixed(2) : '—'}</span>
      <span style="font-size:.7rem;color:var(--text-secondary);">REZ (manji = bolji)</span>
    </div>
    <div class="stat-grid">
      <div class="stat-item"><span class="stat-val">${s.kola}</span><span class="stat-label">Kola</span></div>
      <div class="stat-item"><span class="stat-val">${s.partije}</span><span class="stat-label">Partije</span></div>
      <div class="stat-item"><span class="stat-val">${s.bodovi}</span><span class="stat-label">Bodovi</span></div>
      <div class="stat-item"><span class="stat-val">${s.pct}%</span><span class="stat-label">Odigranost</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--rank-1)">🥇 ${s.p1}</span><span class="stat-label">Pobjede</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--rank-2)">🥈 ${s.p2}</span><span class="stat-label">2. mjesta</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--rank-3)">🥉 ${s.p3}</span><span class="stat-label">3. mjesta</span></div>
      <div class="stat-item"><span class="stat-val">💩 ${s.drekovi}</span><span class="stat-label">Drekovi</span></div>
      <div class="stat-item"><span class="stat-val">🪰 ${s.muhe}</span><span class="stat-label">Muhe</span></div>
      <div class="stat-item"><span class="stat-val" style="font-size:.9rem">${bestStr}</span><span class="stat-label">Najbolji</span></div>
      <div class="stat-item"><span class="stat-val" style="font-size:.9rem">${worstStr}</span><span class="stat-label">Najgori</span></div>
    </div>
  `;
  document.getElementById('playerModal').classList.add('open');
}

// =====================
// EDIT ROUND
// =====================
function openEditRound(roundId) {
  const round = state.rounds.find(r => r.id === roundId);
  if (!round) return;
  const opts = state.players.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  const emptyOpt = `<option value="">-- odaberi --</option>`;
  const getVal = (id, field) => { const g = round.games[id]; return g ? g[field] : ''; };
  const getMuhe = (id) => { const g = round.games[id]; return g ? (g.muhe || 0) : 0; };
  let gamesHtml = '';
  for (let i = 0; i < 4; i++) {
    const selOpts = (field) => state.players.map(p =>
      `<option value="${p.id}" ${getVal(i, field) === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
    ).join('');
    gamesHtml += `
      <div class="partija-card" id="edit-partija-${i}">
        <div class="partija-header"><span class="partija-num">PARTIJA ${i+1}</span></div>
        <div class="partija-grid">
          <div class="form-group"><label>🥇 1. mjesto</label>
            <select class="form-input edit-p1" data-idx="${i}">${emptyOpt}${selOpts('p1')}</select></div>
          <div class="form-group"><label>🥈 2. mjesto</label>
            <select class="form-input edit-p2" data-idx="${i}">${emptyOpt}${selOpts('p2')}</select></div>
          <div class="form-group"><label>🥉 3. mjesto</label>
            <select class="form-input edit-p3" data-idx="${i}">${emptyOpt}${selOpts('p3')}</select></div>
          <div class="form-group"><label>💩 Drek</label>
            <select class="form-input edit-drek" data-idx="${i}">${emptyOpt}${selOpts('drek')}</select></div>
          <div class="partija-drek-row">
            <div class="form-group" style="margin:0"><label>🪰 Muhe</label>
              <select class="form-input edit-muhe" data-idx="${i}">
                ${[0,1,2,3,4].map(v=>`<option value="${v}" ${getMuhe(i)===v?'selected':''}>${v} muha</option>`).join('')}
              </select></div>
          </div>
        </div>
      </div>`;
  }
  document.getElementById('editRoundContent').innerHTML = `
    <h3 style="font-family:var(--font-display);color:var(--pac-yellow);font-size:.85rem;margin-bottom:16px;">
      ✏️ Uredi: ${escHtml(round.name || 'Kolo')}
    </h3>
    <div class="form-group"><label>Datum</label>
      <input type="date" id="editRoundDate" class="form-input" value="${round.date||''}" /></div>
    <div class="form-group"><label>Naziv kola</label>
      <input type="text" id="editRoundName" class="form-input" value="${escHtml(round.name||'')}" /></div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">${gamesHtml}</div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveEditRound('${roundId}')">💾 Spremi</button>
      <button class="btn btn-ghost" onclick="closeEditModal()">Odustani</button>
    </div>
  `;
  document.getElementById('editRoundModal').classList.add('open');
}

async function saveEditRound(roundId) {
  const idx = state.rounds.findIndex(r => r.id === roundId);
  if (idx === -1) return;
  const newDate = document.getElementById('editRoundDate').value;
  const newName = document.getElementById('editRoundName').value.trim();
  const games = [];
  const errors = [];
  for (let i = 0; i < 4; i++) {
    const p1 = document.querySelector(`.edit-p1[data-idx="${i}"]`).value;
    const p2 = document.querySelector(`.edit-p2[data-idx="${i}"]`).value;
    const p3 = document.querySelector(`.edit-p3[data-idx="${i}"]`).value;
    const drek = document.querySelector(`.edit-drek[data-idx="${i}"]`).value;
    const muhe = parseInt(document.querySelector(`.edit-muhe[data-idx="${i}"]`).value) || 0;
    if (!p1 || !p2 || !p3 || !drek) { errors.push(`Partija ${i+1}: popuni sva mjesta`); continue; }
    if (new Set([p1,p2,p3,drek]).size !== 4) { errors.push(`Partija ${i+1}: dupli igrač`); continue; }
    games.push({ p1, p2, p3, drek, muhe });
  }
  if (errors.length > 0) { showToast(errors[0], true); return; }
  if (games.length !== 4) { showToast('Popuni sve partije', true); return; }
  state.rounds[idx] = { ...state.rounds[idx], date: newDate, name: newName, games };
  closeEditModal();
  await saveToCloud();
  renderPovijest();
  showToast('Kolo ažurirano!');
}

function closeEditModal() {
  document.getElementById('editRoundModal').classList.remove('open');
}

// =====================
// DELETE ROUND
// =====================
async function deleteRound(roundId) {
  if (!confirm('Obrisati ovo kolo? Ova radnja je nepovratna.')) return;
  state.rounds = state.rounds.filter(r => r.id !== roundId);
  await saveToCloud();
  renderPovijest();
  showToast('Kolo obrisano');
}

// =====================
// ADD / REMOVE PLAYER
// =====================
async function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) { showToast('Unesi ime igrača', true); return; }
  if (state.players.length >= 8) { showToast('Maksimalno 8 igrača!', true); return; }
  if (state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    showToast('Igrač s tim imenom već postoji', true); return;
  }
  const color = document.querySelector('input[name="playerColor"]:checked').value;
  state.players.push({ id: Date.now().toString(), name, color });
  document.getElementById('newPlayerName').value = '';
  await saveToCloud();
  renderPlayers();
  showToast(`${name} dodan!`);
}

async function removePlayer(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!confirm(`Obrisati igrača "${p?.name}"?`)) return;
  state.players = state.players.filter(x => x.id !== playerId);
  await saveToCloud();
  renderPlayers();
  showToast('Igrač obrisan');
}

// =====================
// EXPORT / IMPORT
// =====================
function exportData() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `covjece-liga-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exportan!');
}

async function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.players || !imported.rounds) throw new Error('Neispravan format');
      if (!confirm('Import će zamijeniti sve trenutne podatke. Nastavi?')) return;
      state = { ...state, ...imported };
      await saveToCloud();
      showToast('Import uspješan!');
      showView('tablica');
    } catch(err) {
      showToast('Greška pri importu: ' + err.message, true);
    }
  };
  reader.readAsText(file);
}

// =====================
// RESET
// =====================
async function resetLeague() {
  const input = prompt('Upiši "RESET" za potvrdu brisanja svih podataka:');
  if (input !== 'RESET') { showToast('Reset otkazan'); return; }
  state = { leagueName: 'Čovječe Liga', players: [], rounds: [] };
  await saveToCloud();
  showView('tablica');
  showToast('Liga resetirana');
}

// =====================
// HELPERS
// =====================
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
let toastTimer = null;
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}
function initMazeDots() {
  const container = document.getElementById('mazeDots');
  if (!container) return;
  for (let i = 0; i < 80; i++) {
    const d = document.createElement('span');
    d.className = 'maze-dot-item';
    container.appendChild(d);
  }
}

// =====================
// INIT
// =====================
async function init() {
  initMazeDots();

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const isLight = html.getAttribute('data-theme') === 'light';
    html.setAttribute('data-theme', isLight ? 'dark' : 'light');
    document.getElementById('themeToggle').textContent = isLight ? '🌙' : '☀️';
  });

  // Add player
  document.getElementById('addPlayerBtn').addEventListener('click', addPlayer);
  document.getElementById('newPlayerName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });

  // Save round
  document.getElementById('saveRoundBtn').addEventListener('click', async () => {
    const result = collectRoundData();
    if (!result.ok) { showToast(result.errors[0], true); return; }
    state.rounds.push(result.round);
    document.getElementById('newRoundDate').value = '';
    document.getElementById('newRoundName').value = '';
    await saveToCloud();
    showView('tablica');
    showToast('Kolo spremljeno! 🎉');
  });

  // Modals
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('playerModal').classList.remove('open');
  });
  document.getElementById('playerModal').addEventListener('click', e => {
    if (e.target === document.getElementById('playerModal'))
      document.getElementById('playerModal').classList.remove('open');
  });
  document.getElementById('editModalClose').addEventListener('click', closeEditModal);
  document.getElementById('editRoundModal').addEventListener('click', e => {
    if (e.target === document.getElementById('editRoundModal')) closeEditModal();
  });

  // Export/Import/Reset
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importFile').addEventListener('change', e => {
    importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('resetBtn').addEventListener('click', resetLeague);

  // Manual refresh
  document.getElementById('refreshBtn')?.addEventListener('click', loadFromCloud);

  // Save league name
  document.getElementById('saveLeagueNameBtn').addEventListener('click', async () => {
    const val = document.getElementById('leagueNameInput').value.trim();
    if (val) {
      state.leagueName = val;
      await saveToCloud();
      showToast('Naziv lige spremen!');
    }
  });

  // Load from cloud on start
  await loadFromCloud();

  // Auto-refresh every 30 seconds
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
