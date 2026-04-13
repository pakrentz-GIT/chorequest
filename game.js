// ═══════════════════════════════════════════════════════════════
//  ChoreQuest — Complete rewrite
// ═══════════════════════════════════════════════════════════════

import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, collection,
         onSnapshot, setDoc, getDoc,
         updateDoc, deleteDoc, serverTimestamp }
                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase ─────────────────────────────────────────────────
const FB_CONFIG = {
  apiKey:            "AIzaSyDgtRgIlYOe2dCwyqb_Iy0vjh_VtOnBIj8",
  authDomain:        "chorequest-48add.firebaseapp.com",
  projectId:         "chorequest-48add",
  storageBucket:     "chorequest-48add.firebasestorage.app",
  messagingSenderId: "470728813489",
  appId:             "1:470728813489:web:3bb0b689d32cf97496eb90",
};
const app = initializeApp(FB_CONFIG);
const db  = getFirestore(app);
const HH  = doc(db, 'household', 'data');
const LOG = collection(db, 'household', 'data', 'log');

// ── Constants ────────────────────────────────────────────────
const CATS = ['CLEANING','KITCHEN','LAUNDRY','OUTDOOR','ERRANDS','OTHER'];
const CCOLORS = { CLEANING:'#30d878',KITCHEN:'#f87820',LAUNDRY:'#5860f8',OUTDOOR:'#f8d820',ERRANDS:'#c848f8',OTHER:'#00e8e8' };
const PIECES = {
  I:{ s:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], c:'#00e8e8' },
  O:{ s:[[1,1],[1,1]],                               c:'#f8d820' },
  T:{ s:[[0,1,0],[1,1,1],[0,0,0]],                   c:'#c848f8' },
  S:{ s:[[0,1,1],[1,1,0],[0,0,0]],                   c:'#30d878' },
  Z:{ s:[[1,1,0],[0,1,1],[0,0,0]],                   c:'#f83820' },
  L:{ s:[[0,0,1],[1,1,1],[0,0,0]],                   c:'#f87820' },
  J:{ s:[[1,0,0],[1,1,1],[0,0,0]],                   c:'#5860f8' },
};
const PKS  = Object.keys(PIECES);
const COLS = 10, ROWS = 20;

// ── State ────────────────────────────────────────────────────
let chores   = [];
let log      = {};   // "id|YYYY-MM-DD" → { by, at, date }
let scores   = { hi: 0, bestDay: 0 };
let player   = localStorage.getItem('cq-player') || 'YOU';
let connected = false;
let selCat   = 'CLEANING';

// game
let board, cur, nxt, score, lines, running, waiting, dtimer;
let cvs, ctx, ncvs, nctx, CELL;

// ── Helpers ──────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0,10);
const pad   = (n,l=6) => String(n).padStart(l,'0');
const rnd   = () => PKS[Math.floor(Math.random()*PKS.length)];
const doneToday   = id => !!log[`${id}|${today()}`];
const whoDidIt    = id => log[`${id}|${today()}`]?.by ?? null;
const countToday  = ()  => Object.keys(log).filter(k=>k.endsWith(`|${today()}`)).length;
const countBy     = p   => Object.values(log).filter(v=>v.by===p&&v.date===today()).length;

// ── Screen ───────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.scr').forEach(s=>{ s.classList.remove('on'); s.style.display='none'; });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  requestAnimationFrame(()=>el.classList.add('on'));
}

// ── Firebase ─────────────────────────────────────────────────
function setSyncUI(st) {
  const el = document.getElementById('sync-txt');
  if (!el) return;
  el.className = st==='ok'?'sync-ok':st==='err'?'sync-no':'sync-wait';
  el.textContent = st==='ok'?'● SYNCED':st==='err'?'● OFFLINE':'● CONNECTING...';
}

async function initFB() {
  setSyncUI('wait');
  try {
    const snap = await getDoc(HH);
    if (!snap.exists()) await setDoc(HH,{chores:[],scores:{hi:0,bestDay:0},createdAt:serverTimestamp()});

    onSnapshot(HH, snap=>{
      if (!snap.exists()) return;
      const d = snap.data();
      chores = d.chores || [];
      scores = { hi: d.scores?.hi||d.scores?.hiScore||0, bestDay: d.scores?.bestDay||0 };
      connected = true;
      setSyncUI('ok');
      refreshUI();
    }, ()=>setSyncUI('err'));

    onSnapshot(LOG, snap=>{
      log = {};
      snap.forEach(d=>{ log[d.id]=d.data(); });
      refreshUI();
    });
  } catch(e) {
    console.error(e);
    setSyncUI('err');
  }
}

async function saveChores() {
  if (!connected) return;
  try { await updateDoc(HH,{chores}); } catch(e){console.error(e);}
}
async function saveScores() {
  if (!connected) return;
  try { await updateDoc(HH,{scores:{hi:scores.hi,bestDay:scores.bestDay}}); } catch(e){console.error(e);}
}
async function writeLog(choreId, p) {
  const key = `${choreId}|${today()}`;
  const entry = { by:p, at:new Date().toISOString(), choreId, date:today() };
  try { await setDoc(doc(LOG,key),entry); } catch(e){console.error(e);}
}

function refreshUI() {
  // title scores
  const th = document.getElementById('t-hi'); if(th) th.textContent = pad(scores.hi);
  const tb = document.getElementById('t-bd'); if(tb) tb.textContent = scores.bestDay+' CHORES';
  // player select
  const py = document.getElementById('ps-you');     if(py) py.textContent = 'TODAY: '+countBy('YOU');
  const pp = document.getElementById('ps-partner'); if(pp) pp.textContent = 'TODAY: '+countBy('PARTNER');
  // chore manager
  renderManage();
  // game chore list
  renderGameChores();
  // game stats
  updateStats();
}

// ═══════════════════════════════════════════════════════════════
//  TITLE
// ═══════════════════════════════════════════════════════════════
document.getElementById('b-start').addEventListener('click', ()=>{
  SFX.select();
  if (!connected) { alert('STILL CONNECTING... TRY AGAIN IN A SECOND!'); return; }
  if (chores.length===0) { show('s-manage'); renderManage(); return; }
  show('s-player'); refreshUI();
});
document.getElementById('b-manage').addEventListener('click', ()=>{
  SFX.select(); show('s-manage'); renderManage();
});

// ═══════════════════════════════════════════════════════════════
//  MANAGE CHORES
// ═══════════════════════════════════════════════════════════════
function renderManage() {
  const el = document.getElementById('chore-list');
  if (!el) return;
  el.innerHTML = '';
  if (chores.length===0) {
    el.innerHTML = '<div style="font-size:7px;color:#6668aa;padding:14px;text-align:center">NO CHORES YET!<br><br>ADD SOME BELOW ↓</div>';
  }
  chores.forEach(c=>{
    const d = document.createElement('div');
    d.className='ci';
    const cc = CCOLORS[c.category]||'#888';
    d.innerHTML=`<span class="ci-name">${c.name}</span><span class="ci-cat" style="color:${cc};border-color:${cc}">${c.category}</span><button class="btn btn-red btn-sm" data-id="${c.id}">✕</button>`;
    d.querySelector('button').addEventListener('click', async ()=>{
      SFX.denied(); chores=chores.filter(x=>x.id!==c.id); await saveChores(); renderManage();
    });
    el.appendChild(d);
  });

  const cb = document.getElementById('cat-btns');
  if (!cb) return;
  cb.innerHTML='';
  CATS.forEach(cat=>{
    const b=document.createElement('button');
    b.className='cbt'+(cat===selCat?' on':'');
    b.textContent=cat;
    if(cat===selCat){b.style.borderColor=CCOLORS[cat];b.style.color=CCOLORS[cat];}
    b.addEventListener('click',()=>{selCat=cat;renderManage();});
    cb.appendChild(b);
  });
}

document.getElementById('b-back-manage').addEventListener('click',()=>{ SFX.select(); show('s-title'); });

document.getElementById('b-add').addEventListener('click', addChore);
document.getElementById('new-name').addEventListener('keydown', e=>{ if(e.key==='Enter') addChore(); });

async function addChore() {
  const inp = document.getElementById('new-name');
  const name = inp.value.trim().toUpperCase();
  if (!name) return;
  if (!connected){ alert('NOT CONNECTED YET'); return; }
  SFX.choreDone();
  chores.push({id:Date.now(), name, category:selCat});
  await saveChores();
  inp.value='';
  renderManage();
}

// ═══════════════════════════════════════════════════════════════
//  PLAYER SELECT
// ═══════════════════════════════════════════════════════════════
document.getElementById('b-back-player').addEventListener('click',()=>{ SFX.select(); show('s-title'); });

['you','partner'].forEach(p=>{
  document.getElementById('pc-'+p).addEventListener('click',()=>{
    SFX.select();
    player = p.toUpperCase();
    localStorage.setItem('cq-player', player);
    startGame();
  });
});

// ═══════════════════════════════════════════════════════════════
//  GAME
// ═══════════════════════════════════════════════════════════════
function startGame() {
  show('s-game');

  // set up canvases
  cvs  = document.getElementById('cvs');
  ctx  = cvs.getContext('2d');
  ncvs = document.getElementById('ncvs');
  nctx = ncvs.getContext('2d');

  // measure cell size from CSS var
  CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell').trim()) || 22;
  cvs.width  = COLS*CELL;  cvs.height = ROWS*CELL;
  ncvs.width = 4*CELL;     ncvs.height= 4*CELL;

  // reset
  board   = Array.from({length:ROWS},()=>Array(COLS).fill(null));
  score   = 0;
  lines   = 0;
  running = true;
  waiting = true;   // wait for first chore
  clearTimeout(dtimer);

  nxt = makePiece();
  spawnNext();

  document.getElementById('g-badge').textContent = player;
  updateStats();
  renderGameChores();
  drawBoard();
  drawNext();
}

function makePiece() {
  const k=rnd(), p=PIECES[k];
  return { k, s:p.s.map(r=>[...r]), c:p.c, x:Math.floor(COLS/2)-Math.floor(p.s[0].length/2), y:0 };
}

function spawnNext() {
  cur = nxt;
  nxt = makePiece();
  if (hits(cur,0,0)) { endGame(false); return; }
  drawBoard(); drawNext();
}

// piece waits — player must complete a chore to drop it
function waitForChore() {
  clearTimeout(dtimer);
  waiting = true;
}

// chore was completed — start dropping
function choreCompleted() {
  if (!running || !waiting) return;
  waiting = false;
  dropLoop();
}

function dropLoop() {
  if (!running || waiting) return;
  if (drop()) {
    dtimer = setTimeout(dropLoop, 420);
  }
}

function drop() {
  if (!cur) return false;
  if (!hits(cur,0,1)) { cur.y++; drawBoard(); return true; }
  lockPiece(); return false;
}

function hits(p, dx, dy, sh) {
  const s = sh||p.s;
  for (let r=0;r<s.length;r++) for (let c=0;c<s[r].length;c++) {
    if (!s[r][c]) continue;
    const nx=p.x+c+dx, ny=p.y+r+dy;
    if (nx<0||nx>=COLS||ny>=ROWS) return true;
    if (ny>=0&&board[ny][nx]) return true;
  }
  return false;
}

function lockPiece() {
  cur.s.forEach((row,r)=>row.forEach((v,c)=>{ if(v){ const ny=cur.y+r; if(ny>=0) board[ny][cur.x+c]=cur.c; } }));
  SFX.place();
  clearRows();
}

function clearRows() {
  const full=[];
  for(let r=ROWS-1;r>=0;r--) if(board[r].every(c=>c!==null)) full.push(r);
  if(full.length>0){
    flashRows(full);
    setTimeout(async()=>{
      full.forEach(r=>{ board.splice(r,1); board.unshift(Array(COLS).fill(null)); });
      const pts=[0,100,300,500,800][full.length]??800;
      score += pts*(full.length>1?2:1);
      lines += full.length;
      SFX.lineClear();
      if(score>scores.hi){ scores.hi=score; await saveScores(); }
      updateStats();
      spawnNext(); waitForChore(); drawBoard(); drawNext();
    },430);
  } else {
    spawnNext(); waitForChore();
  }
}

function flashRows(rows){
  const fx=document.getElementById('rfx'); fx.innerHTML='';
  rows.forEach(r=>{ const d=document.createElement('div'); d.className='rf'; d.style.top=(r*CELL)+'px'; fx.appendChild(d); });
  setTimeout(()=>fx.innerHTML='',460);
}

async function endGame(clear){
  clearTimeout(dtimer); running=false;
  const td=countToday();
  if(score>scores.hi)     scores.hi=score;
  if(td>scores.bestDay)   scores.bestDay=td;
  await saveScores();
  setTimeout(()=>{
    document.getElementById('over-title').textContent = clear?'BOARD CLEAR!':'GAME OVER';
    document.getElementById('o-score').textContent  = pad(score);
    document.getElementById('o-lines').textContent  = lines;
    document.getElementById('o-chores').textContent = td;
    document.getElementById('o-hi').textContent     = pad(scores.hi);
    show('s-over');
    clear ? SFX.choreDone() : SFX.gameOver();
  },400);
}

// ── Drawing ──────────────────────────────────────────────────
function drawBoard(){
  if(!ctx) return;
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // grid
  ctx.strokeStyle='rgba(88,96,248,.1)'; ctx.lineWidth=1;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);
  // locked cells
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c]) cell(ctx,c,r,board[r][c]);
  // ghost + active
  if(cur && !waiting){
    const g={...cur,s:cur.s.map(r=>[...r])};
    while(!hits(g,0,1)) g.y++;
    drawPiece(ctx,g,true);
    drawPiece(ctx,cur,false);
  } else if(cur && waiting){
    // show piece at top, dimmed
    drawPiece(ctx,cur,true);
  }
}

function cell(c,col,row,color,alpha=1){
  const x=col*CELL, y=row*CELL;
  c.globalAlpha=alpha; c.fillStyle=color; c.fillRect(x+1,y+1,CELL-2,CELL-2);
  c.fillStyle='rgba(255,255,255,.3)'; c.fillRect(x+1,y+1,CELL-2,3); c.fillRect(x+1,y+1,3,CELL-2);
  c.fillStyle='rgba(0,0,0,.35)'; c.fillRect(x+1,y+CELL-4,CELL-2,3); c.fillRect(x+CELL-4,y+1,3,CELL-2);
  c.globalAlpha=1;
}
function drawPiece(c,p,ghost){
  p.s.forEach((row,r)=>row.forEach((v,col)=>{ if(v) cell(c,p.x+col,p.y+r,ghost?'rgba(200,200,255,.18)':p.c); }));
}
function drawNext(){
  if(!nctx) return;
  nctx.clearRect(0,0,ncvs.width,ncvs.height);
  if(!nxt) return;
  const s=nxt.s, ox=Math.floor((4-s[0].length)/2), oy=Math.floor((4-s.length)/2);
  s.forEach((row,r)=>row.forEach((v,c)=>{ if(v) cell(nctx,ox+c,oy+r,nxt.c); }));
}

function updateStats(){
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('g-score',  pad(score));
  set('g-lines',  String(lines).padStart(2,'0'));
  set('g-hi',     pad(scores.hi));
  set('g-today',  countToday());
  set('g-you',    countBy('YOU'));
  set('g-partner',countBy('PARTNER'));
  set('g-bestday',scores.bestDay);
}

// ── Chore list inside game ───────────────────────────────────
function renderGameChores(){
  const el=document.getElementById('g-chores');
  if(!el) return;
  el.innerHTML='';
  if(chores.length===0){
    el.innerHTML='<div style="font-size:7px;color:#6668aa;padding:14px;text-align:center">NO CHORES YET!<br>GO HOME → MANAGE CHORES</div>';
    return;
  }
  chores.forEach(c=>{
    const done=doneToday(c.id);
    const d=document.createElement('div');
    d.className='citem'+(done?' done':'');
    const cc=CCOLORS[c.category]||'#888';
    d.innerHTML=`
      <div class="citem-info">
        <div class="citem-name">${c.name}</div>
        <div class="citem-cat" style="color:${cc}">${c.category}</div>
      </div>
      ${done
        ? `<div class="citem-done">✓ ${whoDidIt(c.id)||'DONE'}</div>`
        : `<button class="dbtn" data-id="${c.id}">✓ DONE</button>`}`;
    if(!done){
      d.querySelector('.dbtn').addEventListener('click',()=>markDone(c.id));
    }
    el.appendChild(d);
  });
}

async function markDone(id){
  if(!running) return;
  if(doneToday(id)) return;
  if(!connected){ SFX.denied(); alert('NOT SYNCED — TRY AGAIN IN A MOMENT'); return; }
  SFX.choreDone();
  await writeLog(id, player);
  const td=countToday()+1;
  if(td>scores.bestDay){ scores.bestDay=td; await saveScores(); }
  choreCompleted();
}

// ── Controls ─────────────────────────────────────────────────
function move(dx){ if(!cur||!running||waiting) return; if(!hits(cur,dx,0)){cur.x+=dx;SFX.move();drawBoard();} }
function rotate(){ 
  if(!cur||!running||waiting) return;
  const rot=rotateCW(cur.s);
  for(const dx of [0,1,-1,2,-2]){
    if(!hits(cur,dx,0,rot)){ cur.x+=dx; cur.s=rot; SFX.move(); drawBoard(); return; }
  }
}
function rotateCW(s){ const N=s.length; return Array.from({length:N},(_,r)=>Array.from({length:N},(_,c)=>s[N-1-c][r])); }

// keyboard
document.addEventListener('keydown',e=>{
  if(!running) return;
  if(e.key==='ArrowLeft')  move(-1);
  if(e.key==='ArrowRight') move(1);
  if(e.key==='ArrowDown')  drop();
  if(e.key==='ArrowUp'||e.key===' ') rotate();
});

// d-pad buttons
document.getElementById('dp-l').addEventListener('click',()=>move(-1));
document.getElementById('dp-r').addEventListener('click',()=>move(1));
document.getElementById('dp-rot').addEventListener('click',rotate);
document.getElementById('dp-d').addEventListener('click',drop);

// swipe
let t0=null;
document.addEventListener('touchstart',e=>{
  if(!document.getElementById('s-game').classList.contains('on')) return;
  // don't swipe if tapping a button
  if(e.target.classList.contains('dbtn')||e.target.classList.contains('dp')) return;
  t0={x:e.touches[0].clientX, y:e.touches[0].clientY};
},{passive:true});
document.addEventListener('touchend',e=>{
  if(!t0||!running||waiting) return;
  const dx=e.changedTouches[0].clientX-t0.x, dy=e.changedTouches[0].clientY-t0.y;
  if(Math.abs(dx)<12&&Math.abs(dy)<12) rotate();
  else if(Math.abs(dx)>Math.abs(dy)) move(dx>0?1:-1);
  else if(dy>20) drop();
  t0=null;
},{passive:true});

// home button
document.getElementById('b-ghome').addEventListener('click',()=>{
  SFX.select(); running=false; clearTimeout(dtimer); show('s-title');
});

// game over buttons
document.getElementById('b-again').addEventListener('click',()=>{
  SFX.select();
  if(chores.length===0){ show('s-title'); return; }
  show('s-player'); refreshUI();
});
document.getElementById('b-ohome').addEventListener('click',()=>{ SFX.select(); show('s-title'); });

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
initFB();
show('s-title');
