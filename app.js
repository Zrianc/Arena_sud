/* ===== ČOVJEČE LIGA - app.js ===== */

const API_URL = 'https://script.google.com/macros/s/AKfycbzprb801V4E48cTdSt4db8eCeAqIPnZTsI02N2zBR30dBiCazdaGDRLilj_IEBsn6k/exec';

let state = { leagueName: 'Čovječe Liga', players: [], rounds: [] };
let isSaving = false;
let autoRefreshInterval = null;
let currentView = 'tablica';

// =====================
// API
// =====================
async function apiLoad() {
  const res = await fetch(API_URL + '?action=load');
  if (!res.ok) throw new Error('Greška pri učitavanju');
  return await res.json();
}
async function apiSave(data) {
  const res = await fetch(API_URL + '?action=save', { method: 'POST', body: JSON.stringify(data) });
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
  } catch(e) { showSyncStatus('❌ Greška: ' + e.message, true); }
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
    showToast('Greška: ' + e.message, true);
  } finally { isSaving = false; }
}
function showSyncStatus(msg, isError = false) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--ghost-red)' : 'var(--neon-blue)';
}
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(loadFromCloud, 30000);
}
function renderCurrentView() {
  if (currentView === 'tablica') renderTable();
  else if (currentView === 'kola') renderKola();
  else if (currentView === 'povijest') renderPovijest();
  else if (currentView === 'igraci') renderPlayers();
  else if (currentView === 'postavke') renderPostavke();
}

// =====================
// STATS HELPERS
// Svaka pozicija može biti lista igrača (solo=[id], par=[id1,id2], trio=[id1,id2,id3])
// game.positions = [ {players:[id,...], place:1}, {players:[id,...], place:2}, ... ]
// Backwards compat: stari format game.p1/p2/p3/drek se konvertira
// =====================
function normalizeGame(game) {
  if (game.positions) return game;
  // stari format -> novi
  const pos = [];
  if (game.p1) pos.push({ players: [game.p1], place: 1 });
  if (game.p2) pos.push({ players: [game.p2], place: 2 });
  if (game.p3) pos.push({ players: [game.p3], place: 3 });
  if (game.drek) pos.push({ players: [game.drek], place: 4, muhe: game.muhe || 0 });
  return { positions: pos };
}

function getPlayerPlaceInGame(playerId, game) {
  const g = normalizeGame(game);
  for (const pos of g.positions) {
    if (pos.players.includes(playerId)) return { place: pos.place, muhe: pos.muhe || 0 };
  }
  return null;
}

function computePlayerStats(playerId) {
  const s = { partije: 0, bodovi: 0, p1: 0, p2: 0, p3: 0, drekovi: 0, muhe: 0, kola: 0, propustena: 0, plasmani: [] };
  const kolaSet = new Set();
  for (const round of state.rounds) {
    let playedThisRound = false;
    for (const game of round.games) {
      if (!game) continue;
      const result = getPlayerPlaceInGame(playerId, game);
      if (result !== null) {
        s.partije++; s.bodovi += result.place;
        if (result.place === 1) s.p1++;
        else if (result.place === 2) s.p2++;
        else if (result.place === 3) s.p3++;
        else { s.drekovi++; s.muhe += result.muhe; }
        s.plasmani.push(result.place);
        playedThisRound = true;
      }
    }
    if (playedThisRound) kolaSet.add(round.id);
  }
  s.kola = kolaSet.size;
  s.propustena = state.rounds.length - s.kola;
  s.kazna = s.propustena;
  const prosjek = s.partije > 0 ? s.bodovi / s.partije : 0;
  s.rez = s.partije > 0 ? prosjek + s.kazna : null;
  const totalPossible = state.rounds.length * 4;
  s.pct = totalPossible > 0 ? Math.round((s.partije / totalPossible) * 100) : 0;
  return s;
}

function getTitle(stats, rank, totalPlayers) {
  if (stats.partije === 0) return '';
  if (rank === 1) return '🏆';
  if (rank === totalPlayers) return '💩';
  if (stats.rez !== null && stats.rez <= 1.5) return '👑';
  return '';
}

function sortedPlayers() {
  return [...state.players].map(p => ({ ...p, stats: computePlayerStats(p.id) }))
    .sort((a, b) => {
      const as = a.stats, bs = b.stats;
      if (as.partije === 0 && bs.partije === 0) return 0;
      if (as.partije === 0) return 1;
      if (bs.partije === 0) return -1;
      if (as.rez !== bs.rez) return as.rez - bs.rez;
      if (as.p1 !== bs.p1) return bs.p1 - as.p1;
      if (as.drekovi !== bs.drekovi) return as.drekovi - bs.drekovi;
      return bs.partije - as.partije;
    });
}

// =====================
// ADMIN AUTH
// =====================
const ADMIN_PIN = 'CKRS2026';
let isAdmin = false;

function setAdminMode(active) {
  isAdmin = active;
  // Prikaži/sakrij admin gumbe u navigaciji
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = active ? 'inline-flex' : 'none';
  });
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.textContent = active ? '🔓 Admin' : '🔐 Admin';
    adminBtn.style.borderColor = active ? 'var(--color-green)' : 'var(--border)';
    adminBtn.style.color = active ? 'var(--color-green)' : 'var(--text-secondary)';
  }
  // Ako se odjavljuje a bio je na admin viewu, vrati na tablicu
  if (!active && ['novo-kolo', 'igraci', 'postavke'].includes(currentView)) {
    showView('tablica');
  }
}

function openAdminModal() {
  if (isAdmin) {
    // Već prijavljen — odjava
    if (confirm('Odjavi se iz admin načina?')) {
      setAdminMode(false);
      showToast('Odjavljeni ste iz admin načina');
    }
    return;
  }
  document.getElementById('adminModal').classList.add('open');
  document.getElementById('adminPinInput').value = '';
  document.getElementById('adminPinError').style.display = 'none';
  setTimeout(() => document.getElementById('adminPinInput').focus(), 100);
}

function checkAdminPin() {
  const pin = document.getElementById('adminPinInput').value;
  if (pin === ADMIN_PIN) {
    document.getElementById('adminModal').classList.remove('open');
    setAdminMode(true);
    showToast('Admin način aktivan! 🔓');
  } else {
    document.getElementById('adminPinError').style.display = 'block';
    document.getElementById('adminPinInput').value = '';
    document.getElementById('adminPinInput').focus();
  }
}


function showView(name) {
  // Zaštiti admin viewove
  if (['novo-kolo', 'igraci', 'postavke'].includes(name) && !isAdmin) {
    openAdminModal();
    return;
  }
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');
  const btn = document.querySelector(`[data-view="${name}"]`);
  if (btn) btn.classList.add('active');
  if (name === 'tablica') renderTable();
  if (name === 'kola') renderKola();
  if (name === 'novo-kolo') renderRoundForm();
  if (name === 'povijest') renderPovijest();
  if (name === 'igraci') renderPlayers();
  if (name === 'postavke') renderPostavke();
}

// =====================
// UKUPNA TABLICA
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
        const r = getPlayerPlaceInGame(p.id, game);
        if (r) { place = r.place; break; }
      }
      if (place === 1) histCells += `<td class="hist-cell hist-1">1</td>`;
      else if (place === 2) histCells += `<td class="hist-cell hist-2">2</td>`;
      else if (place === 3) histCells += `<td class="hist-cell hist-3">3</td>`;
      else if (place === 4) histCells += `<td class="hist-cell hist-drek">&#128169;</td>`;
      else histCells += `<td class="hist-cell hist-empty" title="Nije došao">&#129340;</td>`;
    });

    const kaznaStr = s.kazna > 0
      ? `<span style="color:var(--ghost-red);">+${s.kazna.toFixed(2)}</span>`
      : `<span style="color:var(--text-dim);">—</span>`;

    const streak = computeDrekStreak(p.id);
    const saintIcon = streak >= 5 ? ' <span title="5+ drekova zaredom!">🙏</span>' : '';

    const tr = document.createElement('tr');
    tr.dataset.playerId = p.id;
    tr.addEventListener('click', () => openPlayerModal(p.id));
    tr.innerHTML = `
      <td class="col-rank sticky-col"><span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank}</span></td>
      <td class="col-name sticky-col2">
        <div class="player-name-cell"><span>${escHtml(p.name)}${saintIcon}</span></div>
      </td>
      <td class="col-num">${state.rounds.length}</td>
      <td class="col-num">${s.kola}</td>
      <td class="col-num" style="color:var(--ghost-red)">${s.propustena > 0 ? s.propustena : '—'}</td>
      <td class="col-num">${s.partije}</td>
      <td class="col-num">${s.bodovi}</td>
      <td class="col-num">${kaznaStr}</td>
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

  renderDrekStreakTable();
}

function computeDrekStreak(playerId) {
  // Streak po kolu — ako je igrač bio ZADNJI po REZ-u u kolu = 1 drek
  let streak = 0;
  for (const round of state.rounds) {
    // Izračunaj REZ svakog igrača za ovo kolo
    const roundStats = state.players.map(p => {
      let bodovi = 0, partije = 0;
      for (const game of round.games) {
        if (!game) continue;
        const result = getPlayerPlaceInGame(p.id, game);
        if (result) { bodovi += result.place; partije++; }
      }
      return { id: p.id, rez: partije > 0 ? bodovi / partije : null };
    }).filter(p => p.rez !== null); // samo koji su igrali

    if (roundStats.length === 0) continue;

    // Je li ovaj igrač igrao u ovom kolu?
    const playerStat = roundStats.find(p => p.id === playerId);
    if (!playerStat) continue; // nije igrao, ne broji ni za ni protiv

    // Je li zadnji (najveći REZ)?
    const maxRez = Math.max(...roundStats.map(p => p.rez));
    const isLast = playerStat.rez === maxRez;

    if (isLast) streak++;
    else streak = 0;
  }
  return streak;
}

function renderDrekStreakTable() {
  const wrap = document.getElementById('drekStreakWrap');
  if (!wrap) return;

  if (state.players.length === 0 || state.rounds.length === 0) {
    wrap.style.display = 'none';
    return;
  }

  const streaks = state.players
    .map(p => ({ ...p, streak: computeDrekStreak(p.id) }))
    .filter(p => p.streak > 0)
    .sort((a, b) => b.streak - a.streak);

  if (streaks.length === 0) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="streak-table-wrap">
      <div class="streak-header">
        <span style="font-family:var(--font-display);font-size:.8rem;color:var(--ghost-red);letter-spacing:1px;">💩 DREK STREAK</span>
        <span style="font-size:.7rem;color:var(--text-dim);">Uzastopni drekovi zaredom</span>
      </div>
      <div class="scroll-container">
        <table class="liga-table">
          <thead>
            <tr>
              <th class="col-rank sticky-col">#</th>
              <th class="col-name sticky-col2">Igrač</th>
              <th class="col-num" title="Uzastopni drekovi">💩 Zaredom</th>
              <th class="col-num">Status</th>
            </tr>
          </thead>
          <tbody>
            ${streaks.map((p, idx) => {
              const isSaint = p.streak >= 5;
              const flame = p.streak >= 3 ? '🔥'.repeat(Math.min(p.streak - 2, 5)) : '';
              return `
                <tr>
                  <td class="col-rank sticky-col"><span class="rank-badge rank-other">${idx + 1}</span></td>
                  <td class="col-name sticky-col2">
                    <div class="player-name-cell">
                      <span>${escHtml(p.name)}</span>
                      ${isSaint ? '<span style="font-size:1.2rem;margin-left:6px;" title="5+ drekova zaredom!">🙏</span>' : ''}
                    </div>
                  </td>
                  <td class="col-num" style="font-family:var(--font-mono);font-size:1.1rem;color:var(--ghost-red);font-weight:700;">${p.streak} ${flame}</td>
                  <td class="col-num" style="font-size:.85rem;">
                    ${isSaint
                      ? '<span style="color:var(--ghost-red);">Sveta Marija 🙏</span>'
                      : p.streak >= 3
                        ? '<span style="color:var(--pac-yellow);">Opasno!</span>'
                        : '<span style="color:var(--text-dim);">U toku</span>'}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function rebuildHistoryHeaders() {
  const table = document.getElementById('ligaTable');
  if (!table) return;
  const thead = table.querySelector('thead');
  const headerRow = thead.querySelector('tr');
  const allTh = headerRow.querySelectorAll('th');
  for (let i = allTh.length - 1; i >= 14; i--) allTh[i].remove();
  state.rounds.forEach((round, i) => {
    const th = document.createElement('th');
    th.className = 'hist-cell hist-label';
    th.title = round.name || `Kolo ${i + 1}`;
    th.textContent = `K${i + 1}`;
    headerRow.appendChild(th);
  });
}

// =====================
// TABLICA PO KOLIMA
// =====================
function renderKola() {
  const wrap = document.getElementById('kolaTablesWrap');
  const empty = document.getElementById('kolaEmpty');

  if (state.rounds.length === 0) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  wrap.innerHTML = '';

  [...state.rounds].reverse().forEach((round) => {
    const realIdx = state.rounds.indexOf(round);
    const roundName = round.name || `Kolo ${realIdx + 1}`;
    const fmtDate = round.date ? formatDate(round.date) : '';

    const section = document.createElement('div');
    section.className = 'kolo-tablica-wrap';

    // Header stupci P1..P4 + muhe
    let headerCells = `
      <th class="col-rank sticky-col">#</th>
      <th class="col-name sticky-col2">Igrač / Skupina</th>`;
    round.games.forEach((_, gi) => {
      headerCells += `<th class="col-num">P${gi + 1}</th>`;
    });
    headerCells += `<th class="col-num">\uD83E\uDEB0</th>`;

    // Skupi sve pozicije — jedna pozicija = jedan red (može biti 1, 2 ili 3 igrača)
    // Prikaži po pozicijama, sortirano po REZ-u
    const positionRows = [];

    // Skupi jedinstvene pozicije iz svih 4 partije
    // Redosljed: isti set igrača = isti red
    const positionMap = new Map(); // key = sorted player ids joined

    round.games.forEach((game, gi) => {
      if (!game) return;
      const g = normalizeGame(game);
      g.positions.forEach(pos => {
        const key = [...pos.players].sort().join(',');
        if (!positionMap.has(key)) {
          positionMap.set(key, { players: pos.players, plasmani: new Array(4).fill(null), muhe: 0 });
        }
        const row = positionMap.get(key);
        row.plasmani[gi] = pos.place;
        if (pos.place === 4) row.muhe += pos.muhe || 0;
      });
    });

    // Izračunaj bodove i sortiraj
    const rows_data = [...positionMap.values()].map(row => {
      const bodovi = row.plasmani.filter(p => p !== null).reduce((a, b) => a + b, 0);
      const partije = row.plasmani.filter(p => p !== null).length;
      const rez = partije > 0 ? bodovi / partije : null;
      return { ...row, bodovi, partije, rez };
    }).sort((a, b) => {
      if (a.rez === null && b.rez === null) return 0;
      if (a.rez === null) return 1;
      if (b.rez === null) return -1;
      return a.rez - b.rez;
    });

    let rows = '';
    rows_data.forEach((row, idx) => {
      const rank = idx + 1;
      const rezClass = row.rez !== null ? (row.rez <= 2 ? 'rez-good' : row.rez <= 3 ? 'rez-mid' : 'rez-bad') : '';

      // Ime(na) igrača
      const names = row.players.map(id => {
        const p = state.players.find(x => x.id === id);
        return p ? escHtml(p.name) : '?';
      }).join(' + ');

      // Ćelije plasmana
      let cells = '';
      row.plasmani.forEach(place => {
        if (place === 1) cells += `<td class="hist-cell hist-1" style="font-size:1.1rem;font-weight:700;">1</td>`;
        else if (place === 2) cells += `<td class="hist-cell hist-2" style="font-size:1.1rem;">2</td>`;
        else if (place === 3) cells += `<td class="hist-cell hist-3" style="font-size:1.1rem;">3</td>`;
        else if (place === 4) cells += `<td class="hist-cell hist-drek" style="font-size:1.2rem;">&#128169;</td>`;
        else cells += `<td class="hist-cell hist-empty">—</td>`;
      });

      const muheStr = row.muhe > 0
        ? `<span style="color:var(--ghost-red);font-weight:700;">${row.muhe}</span>`
        : `<span style="color:var(--text-dim);">0</span>`;

      rows += `
        <tr>
          <td class="col-rank sticky-col"><span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank}</span></td>
          <td class="col-name sticky-col2"><div class="player-name-cell"><span>${names}</span></div></td>
          ${cells}
          <td class="col-num">${muheStr}</td>
        </tr>`;
    });

    section.innerHTML = `
      <div class="kolo-tablica-header">
        <span class="kolo-title">${escHtml(roundName)}</span>
        ${fmtDate ? `<span class="kolo-date"> · ${fmtDate}</span>` : ''}
      </div>
      <div class="table-wrap" style="margin-bottom:0;">
        <div class="scroll-container">
          <table class="liga-table">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    wrap.appendChild(section);
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

  // 4 pozicije, svaka s dropdown za tip (solo/par/trio) i playerima
  let positionsHtml = '';
  const posIcons = ['🥇', '🥈', '🥉', '💩'];
  const posPlaces = [1, 2, 3, 4];

  for (let pos = 0; pos < 4; pos++) {
    const playerOpts = state.players.map(p =>
      `<option value="${p.id}">${escHtml(p.name)}</option>`
    ).join('');
    const emptyOpt = `<option value="">-- odaberi --</option>`;
    const isDrek = pos === 3;

    positionsHtml += `
      <div class="position-block" id="pos-${num}-${pos}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:1.2rem;">${posIcons[pos]}</span>
          <select class="form-input pos-type" data-partija="${num}" data-pos="${pos}" style="width:auto;padding:4px 8px;font-size:.8rem;" onchange="updatePositionInputs(${num}, ${pos})">
            <option value="solo">Solo</option>
            <option value="par">Par</option>
            <option value="trio">Trio</option>
          </select>
        </div>
        <div class="pos-players" id="pos-players-${num}-${pos}">
          <select class="form-input pos-player-1" data-partija="${num}" data-pos="${pos}" style="margin-bottom:4px;">${emptyOpt}${playerOpts}</select>
        </div>
        ${isDrek ? `
        <div class="pos-muhe-row" id="pos-muhe-${num}-${pos}" style="margin-top:6px;">
          <label style="font-size:.72rem;color:var(--text-secondary);">🪰 Muhe: </label>
          <select class="form-input pos-muhe" data-partija="${num}" data-pos="${pos}" style="width:auto;padding:4px 8px;font-size:.8rem;">
            ${[0,1,2,3,4].map(v=>`<option value="${v}">${v}</option>`).join('')}
          </select>
        </div>` : `<div id="pos-muhe-${num}-${pos}" style="display:none;"></div>`}
      </div>`;
  }

  card.innerHTML = `
    <div class="partija-header"><span class="partija-num">PARTIJA ${num}</span></div>
    <div style="padding:4px 0;">${positionsHtml}</div>`;

  return card;
}

function updatePositionInputs(partijaNum, posIdx) {
  const type = document.querySelector(`.pos-type[data-partija="${partijaNum}"][data-pos="${posIdx}"]`).value;
  const playersContainer = document.getElementById(`pos-players-${partijaNum}-${posIdx}`);

  const playerOpts = state.players.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  const emptyOpt = `<option value="">-- odaberi --</option>`;

  const count = type === 'solo' ? 1 : type === 'par' ? 2 : 3;
  let html = '';
  for (let i = 1; i <= count; i++) {
    html += `<select class="form-input pos-player-${i}" data-partija="${partijaNum}" data-pos="${posIdx}" style="margin-bottom:4px;">${emptyOpt}${playerOpts}</select>`;
  }
  playersContainer.innerHTML = html;
}

function collectRoundData() {
  const date = document.getElementById('newRoundDate').value;
  const name = document.getElementById('newRoundName').value.trim();
  const games = [], errors = [];

  for (let i = 1; i <= 4; i++) {
    const card = document.getElementById(`partija-${i}`);
    if (!card) continue;

    const positions = [];
    const allPlayerIds = [];
    let valid = true;

    for (let pos = 0; pos < 4; pos++) {
      const place = pos + 1; // fiksno: 0=1.mj, 1=2.mj, 2=3.mj, 3=drek
      const type = card.querySelector(`.pos-type[data-pos="${pos}"]`).value;
      const muheEl = card.querySelector(`.pos-muhe[data-pos="${pos}"]`);
      const muhe = place === 4 ? parseInt(muheEl?.value || 0) : 0;
      const count = type === 'solo' ? 1 : type === 'par' ? 2 : 3;

      const players = [];
      for (let pi = 1; pi <= count; pi++) {
        const sel = card.querySelector(`.pos-player-${pi}[data-pos="${pos}"]`);
        if (!sel || !sel.value) { errors.push(`Partija ${i}, pozicija ${pos+1}: odaberi igrača`); valid = false; break; }
        if (allPlayerIds.includes(sel.value)) { errors.push(`Partija ${i}: isti igrač na više pozicija`); valid = false; break; }
        allPlayerIds.push(sel.value);
        players.push(sel.value);
      }
      if (!valid) break;
      positions.push({ players, place, muhe });
    }

    if (!valid) continue;
    games.push({ positions });
  }

  if (errors.length > 0) return { ok: false, errors };
  if (games.length !== 4) return { ok: false, errors: ['Popuni sve partije'] };
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
  [...state.rounds].reverse().forEach((round) => {
    const realIdx = state.rounds.indexOf(round);
    const card = document.createElement('div');
    card.className = 'kolo-card';
    const fmtDate = round.date ? formatDate(round.date) : '';
    const roundName = round.name || `Kolo ${realIdx + 1}`;

    let gamesHtml = '';
    round.games.forEach((game, gi) => {
      if (!game) return;
      const g = normalizeGame(game);
      const sorted = [...g.positions].sort((a, b) => a.place - b.place);
      const placeIcons = ['🥇', '🥈', '🥉', '💩'];
      let posHtml = '';
      sorted.forEach(pos => {
        const names = pos.players.map(id => {
          const p = state.players.find(x => x.id === id);
          return p ? escHtml(p.name) : '?';
        }).join(' + ');
        const icon = placeIcons[pos.place - 1] || '';
        const muheStr = pos.place === 4 && pos.muhe > 0 ? ` <span style="color:var(--text-secondary);font-size:.75rem;">🪰${pos.muhe}</span>` : '';
        posHtml += `<div class="result-row"><span class="result-place">${icon}</span><span class="result-name">${names}</span>${muheStr}</div>`;
      });
      gamesHtml += `<div class="partija-result"><div class="partija-result-title">PARTIJA ${gi + 1}</div>${posHtml}</div>`;
    });

    card.innerHTML = `
      <div class="kolo-header">
        <div><span class="kolo-title">${escHtml(roundName)}</span>${fmtDate ? `<span class="kolo-date"> · ${fmtDate}</span>` : ''}</div>
        <div class="kolo-actions">
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteRound('${round.id}')">🗑️</button>
        </div>
      </div>
      <div class="kolo-body">${gamesHtml}</div>`;
    list.appendChild(card);
  });
}

// =====================
// PLAYERS
// =====================
function renderPlayers() {
  const list = document.getElementById('playersList');
  if (state.players.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:.82rem;">Nema igrača.</p>';
    return;
  }
  list.innerHTML = '';
  state.players.forEach(p => {
    const s = computePlayerStats(p.id);
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `
      <span class="player-item-name">${escHtml(p.name)}</span>
      <span class="player-item-stats">REZ: ${s.rez !== null ? s.rez.toFixed(2) : '—'} · ${s.partije} partija</span>
      <button class="btn btn-sm btn-danger" onclick="removePlayer('${p.id}')">✕</button>`;
    list.appendChild(div);
  });
}

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
  const bestStr = best === 1 ? '🥇 1.' : best === 2 ? '🥈 2.' : best === 3 ? '🥉 3.' : best === 4 ? '💩' : '—';
  const worstStr = worst === 4 ? '💩' : worst === 3 ? '🥉 3.' : worst === 2 ? '🥈 2.' : worst === 1 ? '🥇 1.' : '—';
  document.getElementById('playerModalContent').innerHTML = `
    <div class="player-modal-header">
      <span class="player-modal-name">${escHtml(p.name)}</span>
      <span style="margin-left:auto;font-size:1.5rem">${getTitle(s)}</span>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <span class="rez-big ${rezClass}">${s.rez !== null ? s.rez.toFixed(2) : '—'}</span>
      <span style="font-size:.7rem;color:var(--text-secondary);">REZ</span>
    </div>
    <div class="stat-grid">
      <div class="stat-item"><span class="stat-val">${state.rounds.length}</span><span class="stat-label">Ukupno kola</span></div>
      <div class="stat-item"><span class="stat-val">${s.kola}</span><span class="stat-label">Dolasci</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--ghost-red)">${s.propustena}</span><span class="stat-label">Propuštena</span></div>
      <div class="stat-item"><span class="stat-val">${s.partije}</span><span class="stat-label">Partije</span></div>
      <div class="stat-item"><span class="stat-val">${s.bodovi}</span><span class="stat-label">Bodovi</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--ghost-red)">+${s.kazna}</span><span class="stat-label">Kazna</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--rank-1)">🥇 ${s.p1}</span><span class="stat-label">Pobjede</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--rank-2)">🥈 ${s.p2}</span><span class="stat-label">2. mjesta</span></div>
      <div class="stat-item"><span class="stat-val" style="color:var(--rank-3)">🥉 ${s.p3}</span><span class="stat-label">3. mjesta</span></div>
      <div class="stat-item"><span class="stat-val">💩 ${s.drekovi}</span><span class="stat-label">Drekovi</span></div>
      <div class="stat-item"><span class="stat-val">🪰 ${s.muhe}</span><span class="stat-label">Muhe</span></div>
      <div class="stat-item"><span class="stat-val" style="font-size:.9rem">${bestStr} / ${worstStr}</span><span class="stat-label">Najbolji / Najgori</span></div>
    </div>`;
  document.getElementById('playerModal').classList.add('open');
}

// =====================
// DELETE ROUND
// =====================
async function deleteRound(roundId) {
  if (!confirm('Obrisati ovo kolo?')) return;
  state.rounds = state.rounds.filter(r => r.id !== roundId);
  await saveToCloud();
  renderPovijest();
  showToast('Kolo obrisano');
}

// =====================
// ADD/REMOVE PLAYER
// =====================
async function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) { showToast('Unesi ime igrača', true); return; }
  if (state.players.length >= 12) { showToast('Maksimalno 12 igrača!', true); return; }
  if (state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    showToast('Igrač s tim imenom već postoji', true); return;
  }
  state.players.push({ id: Date.now().toString(), name });
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
// EXPORT / IMPORT / RESET
// =====================
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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
      if (!confirm('Import će zamijeniti sve podatke. Nastavi?')) return;
      state = { ...state, ...imported };
      await saveToCloud();
      showToast('Import uspješan!');
      showView('tablica');
    } catch(err) { showToast('Greška: ' + err.message, true); }
  };
  reader.readAsText(file);
}
async function resetLeague() {
  const input = prompt('Upiši "RESET" za potvrdu:');
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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  // Uvijek počni kao gost, admin mora se prijaviti svaki put
  isAdmin = false;
  setAdminMode(false);

  initMazeDots();
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const isLight = html.getAttribute('data-theme') === 'light';
    html.setAttribute('data-theme', isLight ? 'dark' : 'light');
    document.getElementById('themeToggle').textContent = isLight ? '🌙' : '☀️';
  });
  // Admin PIN
  document.getElementById('adminBtn').addEventListener('click', openAdminModal);
  document.getElementById('adminModalClose').addEventListener('click', () => {
    document.getElementById('adminModal').classList.remove('open');
  });
  document.getElementById('adminPinSubmit').addEventListener('click', checkAdminPin);
  document.getElementById('adminPinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAdminPin();
  });
  document.getElementById('adminModal').addEventListener('click', e => {
    if (e.target === document.getElementById('adminModal'))
      document.getElementById('adminModal').classList.remove('open');
  });


  document.getElementById('newPlayerName').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
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
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('playerModal').classList.remove('open');
  });
  document.getElementById('playerModal').addEventListener('click', e => {
    if (e.target === document.getElementById('playerModal'))
      document.getElementById('playerModal').classList.remove('open');
  });
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importFile').addEventListener('change', e => { importData(e.target.files[0]); e.target.value = ''; });
  document.getElementById('resetBtn').addEventListener('click', resetLeague);
  document.getElementById('refreshBtn')?.addEventListener('click', loadFromCloud);
  document.getElementById('saveLeagueNameBtn').addEventListener('click', async () => {
    const val = document.getElementById('leagueNameInput').value.trim();
    if (val) { state.leagueName = val; await saveToCloud(); showToast('Naziv lige spremen!'); }
  });

  // Ažuriraj igrače kad se mijenja tip (solo/par/trio)
  document.addEventListener('change', e => {
    if (e.target.classList.contains('pos-type')) {
      const partijaNum = e.target.dataset.partija;
      const posIdx = e.target.dataset.pos;
      updatePositionInputs(partijaNum, posIdx);
    }
  });

  await loadFromCloud();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
