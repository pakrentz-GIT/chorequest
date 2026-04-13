// ═══════════════════════════════════════════════════════════════
//  ChoreQuest — Firebase Real-Time Sync Edition
//  Firebase config from your chorequest-48add project
// ═══════════════════════════════════════════════════════════════

import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, collection,
         onSnapshot, setDoc, getDoc,
         updateDoc, deleteDoc, serverTimestamp,
         writeBatch }                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Your Firebase config ─────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDgtRgIlYOe2dCwyqb_Iy0vjh_VtOnBIj8",
  authDomain:        "chorequest-48add.firebaseapp.com",
  projectId:         "chorequest-48add",
  storageBucket:     "chorequest-48add.firebasestorage.app",
  messagingSenderId: "470728813489",
  appId:             "1:470728813489:web:3bb0b689d32cf97496eb90",
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ── Firestore paths ──────────────────────────────────────────
// /household/data        — chores array + scores
// /household/log/{id}   — daily completion entries
const HOUSEHOLD = doc(db, 'household', 'data');
const LOG_COL   = collection(db, 'household', 'data', 'log');

// ── Categories ──────────────────────────────────────────────
const CATEGORIES = ['CLEANING','KITCHEN','LAUNDRY','OUTDOOR','ERRANDS','OTHER'];
const CAT_COLORS = {
  CLEANING:'#30d878', KITCHEN:'#f87820', LAUNDRY:'#5860f8',
  OUTDOOR:'#f8d820',  ERRANDS:'#c848f8', OTHER:'#00e8e8',
};

// ── Tetrominos ───────────────────────────────────────────────
const PIECES = {
  I:{ shape:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color:'#00e8e8' },
  O:{ shape:[[1,1],[1,1]],                               color:'#f8d820' },
  T:{ shape:[[0,1,0],[1,1,1],[0,0,0]],                   color:'#c848f8' },
  S:{ shape:[[0,1,1],[1,1,0],[0,0,0]],                   color:'#30d878' },
  Z:{ shape:[[1,1,0],[0,1,1],[0,0,0]],                   color:'#f83820' },
  L:{ shape:[[0,0,1],[1,1,1],[0,0,0]],                   color:'#f87820' },
  J:{ shape:[[1,0,0],[1,1,1],[0,0,0]],                   color:'#5860f8' },
};
const PIECE_KEYS = Object.keys(PIECES);
const COLS = 10, ROWS = 20;

// ── App State ────────────────────────────────────────────────
let S = {
  chores: [],
  log: {},          // keyed "choreId|YYYY-MM-DD"
  scores: { hiScore: 0, bestDay: 0 },
  currentPlayer: localStorage.getItem('cq-player') || 'YOU',
  connected: false,

  board: [],
  currentPiece: null,
  nextPiece: null,
  score: 0,
  lines: 0,
  gameRunning: false,
  waitingForChore: false,
  dropTimer: null,
};

let selectedCat = 'CLEANING';
let unsubHousehold = null;
let unsubLog = null;

// ═══════════════════════════════════════════════════════════════
//  FIREBASE SYNC
// ═══════════════════════════════════════════════════════════════

function setSyncStatus(status) {
  // 'connecting' | 'online' | 'offline'
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = status;
  el.textContent = status === 'online'      ? '● SYNCED'
                 : status === 'offline'     ? '● OFFLINE'
                 : '● CONNECTING...';
  const dot = document.getElementById('manage-sync');
  if (dot) { dot.className = 'sync-dot ' + (status === 'online' ? 'synced' : status === 'connecting' ? 'syncing' : ''); }
}

async function initFirebase() {
  setSyncStatus('connecting');
  try {
    // Bootstrap document if it doesn't exist yet
    const snap = await getDoc(HOUSEHOLD);
    if (!snap.exists()) {
      await setDoc(HOUSEHOLD, { chores: [], scores: { hiScore: 0, bestDay: 0 }, createdAt: serverTimestamp() });
    }

    // Live listener on household doc (chores + scores)
    unsubHousehold = onSnapshot(HOUSEHOLD, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      S.chores = d.chores || [];
      S.scores = d.scores || { hiScore: 0, bestDay: 0 };
      setSyncStatus('online');
      S.connected = true;
      refreshAllUI();
      Audio.sync();
    }, () => setSyncStatus('offline'));

    // Live listener on log sub-collection
    unsubLog = onSnapshot(LOG_COL, (snap) => {
      S.log = {};
      snap.forEach(doc => { S.log[doc.id] = doc.data(); });
      refreshAllUI();
    }, () => {});

  } catch(e) {
    console.error('Firebase init error:', e);
    setSyncStatus('offline');
  }
}

async function saveChores() {
  if (!S.connected) return;
  try { await updateDoc(HOUSEHOLD, { chores: S.chores }); } catch(e) { console.error(e); }
}

async function saveScores() {
  if (!S.connected) return;
  try { await updateDoc(HOUSEHOLD, { scores: S.scores }); } catch(e) { console.error(e); }
}

async function markLogEntry(choreId, player) {
  const key = `${choreId}|${todayStr()}`;
  const entry = { by: player, at: new Date().toISOString(), choreId, date: todayStr() };
  try {
    await setDoc(doc(LOG_COL, key), entry);
  } catch(e) { console.error(e); }
}

async function unmarkLogEntry(choreId) {
  const key = `${choreId}|${todayStr()}`;
  try { await deleteDoc(doc(LOG_COL, key)); } catch(e) { console.error(e); }
}

// ── Helpers ──────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0,10); }
function pad(n, len=6) { return String(n).padStart(len,'0'); }
function randPiece()   { return PIECE_KEYS[Math.floor(Math.random()*PIECE_KEYS.length)]; }
function isDoneToday(id) { return !!S.log[`${id}|${todayStr()}`]; }
function doneBy(id)      { return S.log[`${id}|${todayStr()}`]?.by ?? null; }
function countTodayDone()         { return Object.keys(S.log).filter(k => k.endsWith(`|${todayStr()}`)).length; }
function countTodayByPlayer(p)    { return Object.values(S.log).filter(v => v.by === p && v.date === todayStr()).length; }

function refreshAllUI() {
  updateTitleScores();
  if (document.getElementById('chore-list-items').closest('#screen-manage')?.style.display !== 'none') renderManage();
  renderGameChoreList();
  updateHUD();
  updatePlayerSelectStats();
}

// ═══════════════════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
//  TITLE
// ═══════════════════════════════════════════════════════════════
function updateTitleScores() {
  const hi = document.getElementById('title-hiscore');
  const bd = document.getElementById('title-bestday');
  if (hi) hi.textContent = pad(S.scores.hiScore);
  if (bd) bd.textContent = S.scores.bestDay + ' CHORES';
}

function initTitle() { updateTitleScores(); showScreen('screen-title'); }

document.getElementById('btn-start').addEventListener('click', () => {
  Audio.select();
  if (S.chores.length === 0) { showScreen('screen-manage'); renderManage(); alert('ADD SOME CHORES FIRST!'); return; }
  showScreen('screen-player'); updatePlayerSelectStats();
});
document.getElementById('btn-manage').addEventListener('click', () => {
  Audio.select(); showScreen('screen-manage'); renderManage();
});

// ═══════════════════════════════════════════════════════════════
//  MANAGE CHORES
// ═══════════════════════════════════════════════════════════════
function renderManage() {
  const list = document.getElementById('chore-list-items');
  list.innerHTML = '';
  if (S.chores.length === 0) {
    list.innerHTML = '<div style="font-size:7px;color:#6668aa;padding:12px;text-align:center">NO CHORES YET!<br><br>ADD SOME BELOW.</div>';
  }
  S.chores.forEach(c => {
    const el = document.createElement('div');
    el.className = 'chore-item';
    el.innerHTML = `
      <span class="chore-item-name">${c.name}</span>
      <span class="chore-item-cat" style="color:${CAT_COLORS[c.category]||'#888'};border-color:${CAT_COLORS[c.category]||'#888'}">${c.category}</span>
      <button class="nes-btn danger small" data-id="${c.id}">✕</button>`;
    el.querySelector('button').addEventListener('click', async () => {
      Audio.denied();
      S.chores = S.chores.filter(ch => ch.id !== c.id);
      await saveChores(); renderManage();
    });
    list.appendChild(el);
  });

  const cb = document.getElementById('cat-buttons');
  cb.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const b = document.createElement('button');
    b.className = 'cat-btn' + (cat === selectedCat ? ' active' : '');
    b.textContent = cat;
    if (cat === selectedCat) { b.style.borderColor = CAT_COLORS[cat]; b.style.color = CAT_COLORS[cat]; }
    b.addEventListener('click', () => { selectedCat = cat; renderManage(); });
    cb.appendChild(b);
  });
}

document.getElementById('btn-back-manage').addEventListener('click', () => { Audio.select(); initTitle(); });
document.getElementById('btn-add-chore').addEventListener('click', addChore);
document.getElementById('new-chore-name').addEventListener('keydown', e => { if (e.key === 'Enter') addChore(); });

async function addChore() {
  const inp  = document.getElementById('new-chore-name');
  const name = inp.value.trim().toUpperCase();
  if (!name) return;
  if (!S.connected) { alert('NOT CONNECTED TO SERVER YET!'); return; }
  Audio.choreDone();
  S.chores.push({ id: Date.now(), name, category: selectedCat });
  await saveChores();
  inp.value = '';
  renderManage();
}

// ═══════════════════════════════════════════════════════════════
//  PLAYER SELECT
// ═══════════════════════════════════════════════════════════════
function updatePlayerSelectStats() {
  const sy = document.getElementById('stat-you');
  const sp = document.getElementById('stat-partner');
  if (sy) sy.textContent = 'TODAY: ' + countTodayByPlayer('YOU');
  if (sp) sp.textContent = 'TODAY: ' + countTodayByPlayer('PARTNER');
}

document.getElementById('btn-back-player').addEventListener('click', () => { Audio.select(); initTitle(); });
['you','partner'].forEach(p => {
  document.getElementById('player-' + p).addEventListener('click', () => {
    Audio.select();
    S.currentPlayer = p.toUpperCase();
    localStorage.setItem('cq-player', S.currentPlayer);
    startGame();
  });
});

// ═══════════════════════════════════════════════════════════════
//  GAME ENGINE
// ═══════════════════════════════════════════════════════════════
let canvas, ctx2, nextCanvas, nextCtx, CELL;

function startGame() {
  showScreen('screen-game');
  canvas     = document.getElementById('game-canvas');
  ctx2       = canvas.getContext('2d');
  nextCanvas = document.getElementById('next-canvas');
  nextCtx    = nextCanvas.getContext('2d');
  CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 21;

  canvas.width  = COLS * CELL; canvas.height = ROWS * CELL;
  nextCanvas.width = 4 * CELL; nextCanvas.height = 4 * CELL;

  S.board          = Array.from({length:ROWS}, () => Array(COLS).fill(null));
  S.score          = 0;
  S.lines          = 0;
  S.gameRunning    = true;
  S.waitingForChore = false;
  clearTimeout(S.dropTimer);

  S.nextPiece = mkPiece();
  spawnNext();

  updateHUD();
  renderGameChoreList();
  document.getElementById('current-player-tag').textContent = '▶ ' + S.currentPlayer;
  drawBoard(); drawNext();
  scheduleWait();
}

function mkPiece() {
  const k = randPiece(), p = PIECES[k];
  return { key:k, shape: p.shape.map(r=>[...r]), color: p.color, x: Math.floor(COLS/2) - Math.floor(p.shape[0].length/2), y: 0 };
}

function spawnNext() {
  S.currentPiece = S.nextPiece;
  S.nextPiece    = mkPiece();
  if (collides(S.currentPiece, 0, 0)) { endGame(false); return; }
  drawBoard(); drawNext();
}

function scheduleWait() {
  clearTimeout(S.dropTimer);
  if (!S.gameRunning) return;
  S.waitingForChore = true;
  document.getElementById('drop-overlay').classList.remove('hidden');
}

function onChoreDone() {
  if (!S.gameRunning || !S.waitingForChore) return;
  S.waitingForChore = false;
  document.getElementById('drop-overlay').classList.add('hidden');
  dropLoop();
}

function dropLoop() {
  if (!S.gameRunning || S.waitingForChore) return;
  if (!softDrop()) return;
  S.dropTimer = setTimeout(dropLoop, 380);
}

function softDrop() {
  if (!S.currentPiece) return false;
  if (!collides(S.currentPiece, 0, 1)) { S.currentPiece.y++; drawBoard(); return true; }
  lockPiece(); return false;
}

function collides(piece, dx, dy, shape) {
  const s = shape || piece.shape;
  for (let r=0; r<s.length; r++) for (let c=0; c<s[r].length; c++) {
    if (!s[r][c]) continue;
    const nx = piece.x+c+dx, ny = piece.y+r+dy;
    if (nx<0||nx>=COLS||ny>=ROWS) return true;
    if (ny>=0 && S.board[ny][nx]) return true;
  }
  return false;
}

function lockPiece() {
  S.currentPiece.shape.forEach((row,r) => row.forEach((v,c) => {
    if (!v) return;
    const ny = S.currentPiece.y+r;
    if (ny>=0) S.board[ny][S.currentPiece.x+c] = S.currentPiece.color;
  }));
  Audio.place();
  clearLines();
}

function clearLines() {
  const full = [];
  for (let r=ROWS-1; r>=0; r--) { if (S.board[r].every(c=>c!==null)) full.push(r); }
  if (full.length > 0) {
    flashRows(full);
    setTimeout(async () => {
      full.forEach(r => { S.board.splice(r,1); S.board.unshift(Array(COLS).fill(null)); });
      const pts = [0,100,300,500,800][full.length] ?? 800;
      S.score += pts * (full.length > 1 ? 2 : 1);
      S.lines += full.length;
      Audio.lineClear();
      if (S.score > S.scores.hiScore) { S.scores.hiScore = S.score; await saveScores(); }
      updateHUD();
      spawnNext(); scheduleWait(); drawBoard(); drawNext();
    }, 430);
  } else {
    spawnNext(); scheduleWait();
  }
}

function flashRows(rows) {
  const fx = document.getElementById('row-clear-fx');
  fx.innerHTML = '';
  rows.forEach(r => {
    const d = document.createElement('div');
    d.className = 'row-flash'; d.style.top = (r*CELL)+'px'; fx.appendChild(d);
  });
  setTimeout(() => fx.innerHTML = '', 460);
}

async function endGame(clear) {
  clearTimeout(S.dropTimer); S.gameRunning = false;
  const today = countTodayDone();
  if (S.score > S.scores.hiScore) S.scores.hiScore = S.score;
  if (today > S.scores.bestDay)   S.scores.bestDay = today;
  await saveScores();
  setTimeout(() => {
    document.getElementById('gameover-title').textContent = clear ? 'BOARD CLEAR!' : 'GAME OVER';
    document.getElementById('go-score').textContent   = pad(S.score);
    document.getElementById('go-lines').textContent   = S.lines;
    document.getElementById('go-chores').textContent  = today;
    document.getElementById('go-hiscore').textContent = pad(S.scores.hiScore);
    showScreen('screen-gameover');
    clear ? Audio.boardClear() : Audio.gameOver();
  }, 400);
}

// ── Rotate ───────────────────────────────────────────────────
function rotateCW(shape) {
  const N = shape.length;
  return Array.from({length:N}, (_,r) => Array.from({length:N}, (_,c) => shape[N-1-c][r]));
}

// ── Draw ─────────────────────────────────────────────────────
function drawBoard() {
  if (!ctx2) return;
  ctx2.clearRect(0, 0, canvas.width, canvas.height);
  ctx2.strokeStyle = 'rgba(88,96,248,0.1)'; ctx2.lineWidth = 1;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) ctx2.strokeRect(c*CELL,r*CELL,CELL,CELL);
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) { if (S.board[r][c]) drawCell(ctx2,c,r,S.board[r][c]); }
  if (S.currentPiece && !S.waitingForChore) {
    const ghost = {...S.currentPiece, shape:S.currentPiece.shape.map(r=>[...r])};
    while (!collides(ghost,0,1)) ghost.y++;
    drawPiece(ctx2,ghost,true);
    drawPiece(ctx2,S.currentPiece,false);
  }
}

function drawCell(c, col, row, color, alpha=1) {
  const x=col*CELL, y=row*CELL;
  c.globalAlpha=alpha; c.fillStyle=color; c.fillRect(x+1,y+1,CELL-2,CELL-2);
  c.fillStyle='rgba(255,255,255,0.32)'; c.fillRect(x+1,y+1,CELL-2,3); c.fillRect(x+1,y+1,3,CELL-2);
  c.fillStyle='rgba(0,0,0,0.38)'; c.fillRect(x+1,y+CELL-4,CELL-2,3); c.fillRect(x+CELL-4,y+1,3,CELL-2);
  c.globalAlpha=1;
}

function drawPiece(c, piece, ghost) {
  piece.shape.forEach((row,r) => row.forEach((v,col) => {
    if (!v) return;
    drawCell(c, piece.x+col, piece.y+r, ghost ? 'rgba(180,180,255,0.14)' : piece.color);
  }));
}

function drawNext() {
  if (!nextCtx) return;
  nextCtx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
  if (!S.nextPiece) return;
  const s=S.nextPiece.shape, ox=Math.floor((4-s[0].length)/2), oy=Math.floor((4-s.length)/2);
  s.forEach((row,r) => row.forEach((v,c) => { if (v) drawCell(nextCtx,ox+c,oy+r,S.nextPiece.color); }));
}

function updateHUD() {
  const sc = document.getElementById('hud-score'); if (sc) sc.textContent = pad(S.score);
  const li = document.getElementById('hud-lines'); if (li) li.textContent = String(S.lines).padStart(2,'0');
  const rh = document.getElementById('rp-hiscore'); if (rh) rh.textContent = pad(S.scores.hiScore);
  const rt = document.getElementById('rp-today');   if (rt) rt.textContent = countTodayDone();
  const rb = document.getElementById('rp-bestday'); if (rb) rb.textContent = S.scores.bestDay;
  const ry = document.getElementById('rp-you');     if (ry) ry.textContent = countTodayByPlayer('YOU');
  const rp = document.getElementById('rp-partner'); if (rp) rp.textContent = countTodayByPlayer('PARTNER');
}

// ── Game chore list ──────────────────────────────────────────
function renderGameChoreList() {
  const el = document.getElementById('game-chore-list');
  if (!el) return;
  el.innerHTML = '';
  S.chores.forEach(c => {
    const done = isDoneToday(c.id);
    const div = document.createElement('div');
    div.className = 'game-chore-item' + (done ? ' completed' : '');
    div.innerHTML = `
      <div class="gc-name">${c.name}</div>
      <div class="gc-cat" style="color:${CAT_COLORS[c.category]||'#888'}">${c.category}</div>
      ${!done
        ? `<button class="nes-btn done-btn" data-id="${c.id}">✓ DONE</button>`
        : `<div style="font-size:5px;color:var(--green)">✓ ${doneBy(c.id)||''}</div>`}`;
    if (!done) {
      div.querySelector('button').addEventListener('click', () => markChoreDone(c.id));
    }
    el.appendChild(div);
  });
}

async function markChoreDone(id) {
  if (!S.gameRunning) return;
  if (isDoneToday(id)) return;
  if (!S.connected) { Audio.denied(); alert('NOT SYNCED YET - TRY AGAIN IN A MOMENT'); return; }
  Audio.choreDone();
  await markLogEntry(id, S.currentPlayer);
  const today = countTodayDone() + 1;
  if (today > S.scores.bestDay) { S.scores.bestDay = today; await saveScores(); }
  onChoreDone();
}

// ── Controls ─────────────────────────────────────────────────
function tryMove(dx) {
  if (!S.currentPiece || !S.gameRunning || S.waitingForChore) return;
  if (!collides(S.currentPiece,dx,0)) { S.currentPiece.x+=dx; Audio.move(); drawBoard(); }
}
function tryRotate() {
  if (!S.currentPiece || !S.gameRunning || S.waitingForChore) return;
  const rot = rotateCW(S.currentPiece.shape);
  for (const dx of [0,1,-1]) {
    if (!collides(S.currentPiece,dx,0,rot)) { S.currentPiece.x+=dx; S.currentPiece.shape=rot; Audio.move(); drawBoard(); return; }
  }
}

document.addEventListener('keydown', e => {
  if (!S.gameRunning || S.waitingForChore) return;
  if (e.key==='ArrowLeft')          tryMove(-1);
  if (e.key==='ArrowRight')         tryMove(1);
  if (e.key==='ArrowDown')          softDrop();
  if (e.key==='ArrowUp'||e.key===' ') tryRotate();
});

// Touch controls (buttons)
document.getElementById('tc-left')  .addEventListener('click', () => tryMove(-1));
document.getElementById('tc-right') .addEventListener('click', () => tryMove(1));
document.getElementById('tc-rotate').addEventListener('click', tryRotate);
document.getElementById('tc-down')  .addEventListener('click', softDrop);

// Swipe on board
let ts = null;
document.addEventListener('touchstart', e => {
  if (!document.getElementById('screen-game').classList.contains('active')) return;
  ts = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, {passive:true});
document.addEventListener('touchend', e => {
  if (!ts || !S.gameRunning || S.waitingForChore) return;
  const dx = e.changedTouches[0].clientX - ts.x;
  const dy = e.changedTouches[0].clientY - ts.y;
  if (Math.abs(dx)<10 && Math.abs(dy)<10) { tryRotate(); }
  else if (Math.abs(dx)>Math.abs(dy))     { tryMove(dx>0?1:-1); }
  else if (dy>20)                          { softDrop(); }
  ts = null;
}, {passive:true});

// ── Game over buttons ────────────────────────────────────────
document.getElementById('btn-play-again').addEventListener('click', () => {
  Audio.select();
  if (S.chores.length===0) { initTitle(); return; }
  showScreen('screen-player'); updatePlayerSelectStats();
});
document.getElementById('btn-go-home').addEventListener('click', () => { Audio.select(); initTitle(); });

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
initFirebase();
initTitle();
