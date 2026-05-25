/* ===== OTAFF Flashcard App - app.js ===== */
'use strict';

// ─── Category definitions ─────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',              label: 'すべて',            file: null },
  { key: 'hygiene',          label: '衛生',              file: 'hygiene.json' },
  { key: 'safety',           label: '安全',              file: 'safety.json' },
  { key: 'haccp',            label: 'HACCP',             file: 'haccp.json' },
  { key: 'procedure',        label: '手順',              file: 'procedure.json' },
  { key: 'food-processing',  label: '食品加工',          file: 'food-processing.json' },
  { key: 'ingredients',      label: '原材料',            file: 'ingredients.json' },
  { key: 'machinery',        label: '機械',              file: 'machinery.json' },
  { key: 'tools',            label: '器具',              file: 'tools.json' },
  { key: 'cleaning',         label: '清掃',              file: 'cleaning.json' },
  { key: 'emergency',        label: '緊急',              file: 'emergency.json' },
  { key: 'warning',          label: '警告',              file: 'warning.json' },
  { key: 'ppe',              label: 'PPE',               file: 'ppe.json' },
  { key: 'packaging',        label: '包装',              file: 'packaging.json' },
  { key: 'storage',          label: '保管',              file: 'storage.json' },
  { key: 'production',       label: '生産',              file: 'production.json' },
  { key: 'quality-control',  label: '品質管理',          file: 'quality-control.json' },
  { key: 'regulations',      label: '規制',              file: 'regulations.json' },
  { key: 'temperature-control', label: '温度管理',       file: 'temperature-control.json' },
  { key: 'work-actions',     label: '作業動詞',          file: 'work-actions.json' },
  { key: 'factory',          label: '工場',              file: 'factory.json' },
];

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  allVocab: [],          // all 1261 vocab with category tag
  categoryVocab: {},     // per-category raw
  filteredVocab: [],     // currently shown list
  currentIndex: 0,
  isFlipped: false,
  activeCategory: 'all',
  mode: 'study',         // 'study' | 'random' | 'favorites' | 'list'
  isShuffled: false,
  searchQuery: '',
  favorites: new Set(),
  seenSet: new Set(),
  touchStartX: 0,
  touchStartY: 0,
  isDragging: false,
  dragX: 0,
};

// ─── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $q = sel => document.querySelector(sel);
const $qa = sel => [...document.querySelectorAll(sel)];

// ─── LocalStorage helpers ───────────────────────────────────────────────────
const LS = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Data loading ───────────────────────────────────────────────────────────
async function loadAllData() {
  const loadable = CATEGORIES.filter(c => c.file);
  const results = await Promise.all(
    loadable.map(cat =>
      fetch(`./data/${cat.file}`)
        .then(r => r.ok ? r.json() : [])
        .then(arr => ({ key: cat.key, data: arr }))
        .catch(() => ({ key: cat.key, data: [] }))
    )
  );

  results.forEach(({ key, data }) => {
    state.categoryVocab[key] = data;
    data.forEach(v => {
      state.allVocab.push({ ...v, _cat: key });
    });
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Load saved state
  state.favorites = new Set(LS.get('otaff_favorites', []));
  state.activeCategory = LS.get('otaff_category', 'all');
  state.mode = LS.get('otaff_mode', 'study');
  state.currentIndex = 0;

  await loadAllData();

  buildTabs();
  buildModeBar();
  bindControls();
  bindNav();
  bindSwipe();
  applyFilter();
  renderStatsBar();
  updateHeader();

  // Register PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  // Hide loading, show app
  setTimeout(() => {
    $('loading').classList.add('hidden');
    $('app').classList.add('visible');
    renderCard();
  }, 1800);
}

// ─── Build tabs ──────────────────────────────────────────────────────────────
function buildTabs() {
  const container = $('tabsContainer');
  container.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const count = cat.key === 'all'
      ? state.allVocab.length
      : (state.categoryVocab[cat.key] || []).length;

    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (cat.key === state.activeCategory ? ' active' : '');
    btn.dataset.cat = cat.key;
    btn.innerHTML = `${cat.label} <span class="tab-count">${count}</span>`;
    btn.addEventListener('click', () => selectCategory(cat.key));
    container.appendChild(btn);
  });
}

// ─── Build mode bar ──────────────────────────────────────────────────────────
function buildModeBar() {
  const modes = [
    { key: 'study',     label: '順番学習' },
    { key: 'random',    label: 'ランダム' },
    { key: 'favorites', label: '★ お気に入り' },
    { key: 'list',      label: '一覧リスト' },
  ];
  const bar = $('modeBar');
  bar.innerHTML = '';
  modes.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (state.mode === m.key ? ' active' : '');
    btn.textContent = m.label;
    btn.addEventListener('click', () => selectMode(m.key));
    bar.appendChild(btn);
  });
}

// ─── Category selection ──────────────────────────────────────────────────────
function selectCategory(key) {
  state.activeCategory = key;
  state.currentIndex = 0;
  state.isFlipped = false;
  LS.set('otaff_category', key);
  $qa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === key));
  applyFilter();
  renderCard();
  renderStatsBar();
  updateHeader();
}

// ─── Mode selection ──────────────────────────────────────────────────────────
function selectMode(key) {
  state.mode = key;
  state.currentIndex = 0;
  state.isFlipped = false;
  LS.set('otaff_mode', key);
  $qa('.mode-btn').forEach((b, i) => {
    const modes = ['study', 'random', 'favorites', 'list'];
    b.classList.toggle('active', modes[i] === key);
  });

  if (key === 'random') {
    shuffleFiltered();
  } else {
    applyFilter();
  }

  const listView = $('listView');
  const cardArea = $('cardArea');
  if (key === 'list') {
    listView.classList.add('active');
    cardArea.style.display = 'none';
    renderList();
  } else {
    listView.classList.remove('active');
    cardArea.style.display = '';
    renderCard();
  }
  updateProgress();
  updateNavBtns();
}

// ─── Filter vocab ─────────────────────────────────────────────────────────────
function applyFilter() {
  let source;
  if (state.mode === 'favorites') {
    source = state.allVocab.filter(v => state.favorites.has(favKey(v)));
  } else if (state.activeCategory === 'all') {
    source = [...state.allVocab];
  } else {
    source = (state.categoryVocab[state.activeCategory] || []).map(v => ({ ...v, _cat: state.activeCategory }));
  }

  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    source = source.filter(v =>
      v.jp.includes(q) ||
      v.reading.includes(q) ||
      v.id.toLowerCase().includes(q)
    );
  }

  state.filteredVocab = source;
}

function shuffleFiltered() {
  applyFilter();
  for (let i = state.filteredVocab.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.filteredVocab[i], state.filteredVocab[j]] = [state.filteredVocab[j], state.filteredVocab[i]];
  }
}

// ─── Render card ─────────────────────────────────────────────────────────────
function renderCard(direction = 'none') {
  const area = $('cardArea');
  const vocab = state.filteredVocab;

  if (!vocab.length) {
    area.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p>${state.searchQuery ? '検索結果なし' : 'カードがありません'}</p>
      </div>`;
    updateProgress();
    return;
  }

  const v = vocab[state.currentIndex];
  state.isFlipped = false;
  state.seenSet.add(favKey(v));
  LS.set('otaff_seen', [...state.seenSet]);

  const isFav = state.favorites.has(favKey(v));
  const catLabel = CATEGORIES.find(c => c.key === (v._cat || state.activeCategory))?.label || '';

  area.innerHTML = `
    <div class="card-stack">
      <div class="card-ghost card-ghost-2"></div>
      <div class="card-ghost card-ghost-1"></div>
      <div class="flashcard entering" id="flashcard" tabindex="0" role="button" aria-label="カードをタップして答えを見る">
        <!-- FRONT -->
        <div class="card-face card-front">
          <span class="card-category-badge">${catLabel}</span>
          <button class="card-fav-btn ${isFav ? 'starred' : ''}" id="favBtn" aria-label="お気に入り">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
          <div class="card-jp">${escHtml(v.jp)}</div>
          <div class="card-reading">${escHtml(v.reading)}</div>
          <div class="card-flip-hint">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            タップして答えを見る
          </div>
          <span class="card-index">${state.currentIndex + 1} / ${vocab.length}</span>
        </div>
        <!-- BACK -->
        <div class="card-face card-back">
          <span class="card-category-badge">${catLabel}</span>
          <button class="card-fav-btn ${isFav ? 'starred' : ''}" id="favBtn2" aria-label="お気に入り">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
          <div class="card-id-label">インドネシア語</div>
          <div class="card-id">${escHtml(v.id)}</div>
          <div class="card-jp-small">${escHtml(v.jp)}</div>
          <span class="card-index">${state.currentIndex + 1} / ${vocab.length}</span>
        </div>
      </div>
      <div class="swipe-hint left"  id="hintLeft">✗ SKIP</div>
      <div class="swipe-hint right" id="hintRight">✓ OK</div>
    </div>
  `;

  // Bind card events
  const card = $('flashcard');
  card.addEventListener('click', onCardClick);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') flipCard(); });

  [$('favBtn'), $('favBtn2')].forEach(btn => {
    if (btn) btn.addEventListener('click', e => { e.stopPropagation(); toggleFav(v); btn.closest('.card-face').querySelector('.card-fav-btn').classList.toggle('starred'); });
  });

  updateProgress();
  updateNavBtns();
}

function onCardClick(e) {
  if (e.target.closest('.card-fav-btn')) return;
  flipCard();
}

function flipCard() {
  const card = $('flashcard');
  if (!card) return;
  state.isFlipped = !state.isFlipped;
  card.classList.toggle('flipped', state.isFlipped);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goNext(direction = 'left') {
  if (state.currentIndex >= state.filteredVocab.length - 1) return;
  animateCardOut(direction, () => {
    state.currentIndex++;
    state.isFlipped = false;
    renderCard(direction);
  });
}

function goPrev() {
  if (state.currentIndex <= 0) return;
  animateCardOut('right', () => {
    state.currentIndex--;
    state.isFlipped = false;
    renderCard('right');
  });
}

function animateCardOut(direction, cb) {
  const card = $('flashcard');
  if (!card) { cb(); return; }
  card.classList.add(direction === 'left' ? 'swipe-left' : 'swipe-right');
  card.style.transition = 'none';
  setTimeout(cb, 360);
}

function updateNavBtns() {
  const prev = $('btnPrev'), next = $('btnNext');
  if (!prev || !next) return;
  prev.disabled = state.currentIndex <= 0;
  next.disabled = state.currentIndex >= state.filteredVocab.length - 1;
}

function updateProgress() {
  const vocab = state.filteredVocab;
  const total = vocab.length;
  const current = total ? state.currentIndex + 1 : 0;
  const pct = total ? Math.round((current / total) * 100) : 0;

  const fill = $('progressFill');
  const label = $('progressLabel');
  const pctEl = $('progressPct');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${current} / ${total}`;
  if (pctEl) pctEl.textContent = pct + '%';
}

// ─── Touch / Swipe ────────────────────────────────────────────────────────────
function bindSwipe() {
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
}

function onTouchStart(e) {
  const card = e.target.closest('.flashcard');
  if (!card) return;
  state.touchStartX = e.touches[0].clientX;
  state.touchStartY = e.touches[0].clientY;
  state.isDragging = true;
  state.dragX = 0;
}

function onTouchMove(e) {
  if (!state.isDragging) return;
  const card = $('flashcard');
  if (!card) return;

  const dx = e.touches[0].clientX - state.touchStartX;
  const dy = e.touches[0].clientY - state.touchStartY;

  if (Math.abs(dy) > Math.abs(dx) * 1.5) { state.isDragging = false; return; }
  e.preventDefault();

  state.dragX = dx;
  const rotate = dx * 0.06;
  const opacity = 1 - Math.min(Math.abs(dx) / 300, 0.5);
  card.style.transform = state.isFlipped
    ? `rotateY(180deg) translateX(${-dx}px) rotate(${-rotate}deg)`
    : `translateX(${dx}px) rotate(${rotate}deg)`;
  card.style.opacity = opacity;
  card.style.transition = 'none';

  const hintL = $('hintLeft'), hintR = $('hintRight');
  if (hintL) hintL.style.opacity = dx < -40 ? Math.min((-dx - 40) / 80, 1) : 0;
  if (hintR) hintR.style.opacity = dx > 40  ? Math.min((dx - 40) / 80, 1)  : 0;
}

function onTouchEnd(e) {
  if (!state.isDragging) return;
  state.isDragging = false;
  const card = $('flashcard');
  if (!card) return;

  const dx = state.dragX;
  card.style.transition = '';
  card.style.opacity = '';

  const hintL = $('hintLeft'), hintR = $('hintRight');
  if (hintL) hintL.style.opacity = 0;
  if (hintR) hintR.style.opacity = 0;

  if (dx < -80 && state.currentIndex < state.filteredVocab.length - 1) {
    goNext('left');
  } else if (dx > 80 && state.currentIndex > 0) {
    goPrev();
  } else {
    // snap back
    card.style.transform = state.isFlipped ? 'rotateY(180deg)' : '';
  }
}

// ─── Keyboard navigation ──────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case 'ArrowRight': case 'l': goNext(); break;
      case 'ArrowLeft':  case 'h': goPrev(); break;
      case ' ': case 'f': e.preventDefault(); flipCard(); break;
    }
  });
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function bindControls() {
  const searchInput = $('searchInput');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = searchInput.value;
      state.currentIndex = 0;
      state.isFlipped = false;
      applyFilter();
      if (state.mode === 'list') renderList();
      else renderCard();
      updateProgress();
    }, 200);
  });

  $('btnShuffle').addEventListener('click', () => {
    state.currentIndex = 0;
    shuffleFiltered();
    renderCard();
    showToast('シャッフルしました 🔀');
  });

  $('btnFavFilter').addEventListener('click', () => {
    selectMode('favorites');
    $qa('.mode-btn').forEach((b, i) => b.classList.toggle('active', i === 2));
  });

  bindKeyboard();
}

function bindNav() {
  $('btnPrev').addEventListener('click', goPrev);
  $('btnNext').addEventListener('click', () => goNext());

  // Bottom nav
  $qa('.bnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      $qa('.bnav-btn').forEach(b => b.classList.toggle('active', b === btn));
      selectMode(mode);
    });
  });
}

// ─── Favorites ────────────────────────────────────────────────────────────────
function favKey(v) {
  return v.jp + '|' + v.reading;
}

function toggleFav(v) {
  const k = favKey(v);
  if (state.favorites.has(k)) {
    state.favorites.delete(k);
    showToast('お気に入りを削除しました');
  } else {
    state.favorites.add(k);
    showToast('★ お気に入りに追加しました');
  }
  LS.set('otaff_favorites', [...state.favorites]);
  updateHeader();
  renderStatsBar();
  // sync both fav buttons
  [$('favBtn'), $('favBtn2')].forEach(btn => {
    if (btn) btn.classList.toggle('starred', state.favorites.has(k));
  });
}

// ─── List view ────────────────────────────────────────────────────────────────
function renderList() {
  const listView = $('listView');
  const vocab = state.filteredVocab;

  if (!vocab.length) {
    listView.innerHTML = `
      <div class="fav-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <p>${state.mode === 'favorites' ? 'まだお気に入りがありません' : '結果なし'}</p>
      </div>`;
    return;
  }

  listView.innerHTML = vocab.map((v, i) => {
    const isFav = state.favorites.has(favKey(v));
    return `
      <div class="list-item" data-idx="${i}">
        <div class="list-item-jp">${escHtml(v.jp)}</div>
        <div class="list-item-reading">${escHtml(v.reading)}</div>
        <div class="list-item-id">${escHtml(v.id)}</div>
        <button class="list-item-star ${isFav ? 'starred' : ''}" data-idx="${i}" aria-label="お気に入り">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  // Bind list star buttons
  $qa('.list-item-star').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const v = vocab[idx];
      toggleFav(v);
      btn.classList.toggle('starred', state.favorites.has(favKey(v)));
    });
  });

  // Bind list item click -> go to card
  $qa('.list-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.list-item-star')) return;
      const idx = parseInt(item.dataset.idx);
      state.currentIndex = idx;
      state.isFlipped = false;
      selectMode('study');
    });
  });
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function renderStatsBar() {
  const bar = $('statsBar');
  const total = state.allVocab.length;
  const favCount = state.favorites.size;
  const seenCount = state.seenSet.size;

  bar.innerHTML = `
    <div class="stat-pill">
      <div class="stat-dot accent"></div>
      <span class="stat-label">総語彙</span>
      <span class="stat-val">${total}</span>
    </div>
    <div class="stat-pill">
      <div class="stat-dot gold"></div>
      <span class="stat-label">お気に入り</span>
      <span class="stat-val">${favCount}</span>
    </div>
    <div class="stat-pill">
      <div class="stat-dot green"></div>
      <span class="stat-label">学習済み</span>
      <span class="stat-val">${seenCount}</span>
    </div>
    <div class="stat-pill">
      <span class="stat-label">カテゴリ</span>
      <span class="stat-val">${CATEGORIES.length - 1}</span>
    </div>
  `;
}

// ─── Header count ─────────────────────────────────────────────────────────────
function updateHeader() {
  const el = $('headerCount');
  if (el) {
    const count = state.mode === 'favorites'
      ? state.favorites.size
      : state.filteredVocab.length;
    el.textContent = count + ' 語';
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const wrap = $('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
