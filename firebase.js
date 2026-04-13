// ═══════════════════════════════════════════════════════════════
//  ChoreQuest v4 — Chore List → Detail → Tetris flow
// ═══════════════════════════════════════════════════════════════

import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, collection,
         onSnapshot, setDoc, getDoc,
         updateDoc, deleteDoc, serverTimestamp }
                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config ───────────────────────────────────────────
const app = initializeApp({
  apiKey:            "AIzaSyDgtRgIlYOe2dCwyqb_Iy0vjh_VtOnBIj8",
  authDomain:        "chorequest-48add.firebaseapp.com",
  projectId:         "chorequest-48add",
  storageBucket:     "chorequest-48add.firebasestorage.app",
  messagingSenderId: "470728813489",
  appId:             "1:470728813489:web:3bb0b689d32cf97496eb90",
});
const db  = getFirestore(app);
const HH  = doc(db, 'household', 'data');
const LOG = collection(db, 'household', 'data', 'log');

// ── Constants ─────────────────────────────────────────────────
const CATS = ['CLEANING','KITCHEN','LAUNDRY','OUTDOOR','ERRANDS','OTHER'];
const CC   = { CLEANING:'#30d878',KITCHEN:'#f87820',LAUNDRY:'#5860f8',OUTDOOR:'#f8d820',ERRANDS:'#c848f8',OTHER:'#00e8e8' };
const PIECES = {
  I:{s:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],c:'#00e8e8'},
  O:{s:[[1,1],[1,1]],                              c:'#f8d820'},
  T:{s:[[0,1,0],[1,1,1],[0,0,0]],                  c:'#c848f8'},
  S:{s:[[0,1,1],[1,1,0],[0,0,0]],                  c:'#30d878'},
  Z:{s:[[1,1,0],[0,1,1],[0,0,0]],                  c:'#f83820'},
  L:{s:[[0,0,1],[1,1,1],[0,0,0]],                  c:'#f87820'},
  J:{s:[[1,0,0],[1,1,1],[0,0,0]],                  c:'#5860f8'},
};
const PKS = Object.keys(PIECES);
const COLS = 10, ROWS = 20;

// ── Shared state ──────────────────────────────────────────────
let chores    = [];
let log       = {};    // "id|YYYY-MM-DD" → { by, at, date }
let scores    = { hi:0, bestDay:0 };
let player    = localStorage.getItem('cq-player') || 'YOU';
let connected = false;
let selCat    = 'CLEANING';

// Game state
let board, cur, nxt, score, lines, running, dtimer;
let cvs, ctx, ncvs, nctx, CELL;
let sessionScore = 0;  // score for this play session
let sessionLines = 0;

// ── Helpers ───────────────────────────────────────────────────
const today    = () => new Date().toISOString().slice(0,10);
const pad      = (n,l=6) => String(n).padStart(l,'0');
const rndPiece = () => PKS[Math.floor(Math.random()*PKS.length)];
const doneToday  = id => !!log[`${id}|${today()}`];
const whoDidIt   = id => log[`${id}|${today()}`]?.by ?? null;
const whenDidIt  = id => log[`${id}|${today()}`]?.at ?? null;
const countToday = ()  => Object.keys(log).filter(k=>k.endsWith(`|${today()}`)).length;
const countBy    = p   => Object.values(log).filter(v=>v.by===p&&v.date===today()).length;

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

// ── Screen management ─────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.scr').forEach(s=>{ s.classList.remove('on'); s.style.display='none'; });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  requestAnimationFrame(()=>el.classList.add('on'));
}

// ── Firebase ──────────────────────────────────────────────────
function setSyncUI(st) {
  const el = document.getElementById('sync-txt'); if(!el) return;
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
      const sc = d.scores||{};
      scores = { hi: sc.hi||sc.hiScore||0, bestDay: sc.bestDay||0 };
      connected = true;
      setSyncUI('ok');
      refreshAll();
    }, ()=>setSyncUI('err'));

    onSnapshot(LOG, snap=>{
      log = {};
      snap.forEach(d=>{ log[d.id]=d.data(); });
      refreshAll();
    });
  } catch(e) { console.error(e); setSyncUI('err'); }
}

async function saveChores() { if(connected) try{ await updateDoc(HH,{chores}); }catch(e){console.error(e);} }
async function saveScores() { if(connected) try{ await updateDoc(HH,{scores:{hi:scores.hi,bestDay:scores.bestDay}}); }catch(e){console.error(e);} }
async function writeLog(choreId) {
  const key=`${choreId}|${today()}`;
  try{ await setDoc(doc(LOG,key),{by:player,at:new Date().toISOString(),choreId,date:today()}); }catch(e){console.error(e);}
}

function refreshAll() {
  // title
  const th=document.getElementById('t-hi'); if(th) th.textContent=pad(scores.hi);
  const tb=document.getElementById('t-bd'); if(tb) tb.textContent=scores.bestDay+' CHORES';
  // player select
  const py=document.getElementById('ps-you');     if(py) py.textContent='TODAY: '+countBy('YOU');
  const pp=document.getElementById('ps-partner'); if(pp) pp.textContent='TODAY: '+countBy('PARTNER');
  // chore list stats
  refreshChoreStats();
  // mission list if visible
  if(document.getElementById('s-chores').classList.contains('on')) renderMissions();
  // manage if visible
  if(document.getElementById('s-manage').classList.contains('on')) renderManage();
  // game stats
  updateGameStats();
}

// ═══════════════════════════════════════════════════════════════
//  TITLE SCREEN
// ═══════════════════════════════════════════════════════════════
document.getElementById('b-start').addEventListener('click',()=>{
  SFX.select();
  if(!connected){ alert('STILL CONNECTING...\nTRY AGAIN IN A SECOND!'); return; }
  if(chores.length===0){ show('s-manage'); renderManage(); return; }
  show('s-player'); refreshAll();
});
document.getElementById('b-manage').addEventListener('click',()=>{ SFX.select(); show('s-manage'); renderManage(); });

// ═══════════════════════════════════════════════════════════════
//  MANAGE CHORES
// ═══════════════════════════════════════════════════════════════
function renderManage() {
  const el=document.getElementById('chore-list'); if(!el) return;
  el.innerHTML='';
  if(chores.length===0){
    el.innerHTML='<div style="font-size:9px;color:#6668aa;padding:18px;text-align:center;line-height:2">NO CHORES YET!<br>ADD SOME BELOW ↓</div>';
  }
  chores.forEach(c=>{
    const d=document.createElement('div'); d.className='ci';
    const cc=CC[c.category]||'#888';
    d.innerHTML=`
      <div class="ci-info">
        <div class="ci-name">${c.name}</div>
        ${c.desc?`<div class="ci-desc">${c.desc}</div>`:''}
      </div>
      <span class="ci-cat" style="color:${cc};border-color:${cc}">${c.category}</span>
      <button class="btn btn-red" style="font-size:8px;padding:8px 12px" data-id="${c.id}">✕</button>`;
    d.querySelector('button').addEventListener('click',async()=>{
      SFX.denied(); chores=chores.filter(x=>x.id!==c.id); await saveChores(); renderManage();
    });
    el.appendChild(d);
  });

  // category buttons
  const cb=document.getElementById('cat-btns'); if(!cb) return;
  cb.innerHTML='';
  CATS.forEach(cat=>{
    const b=document.createElement('button');
    b.className='cbt'+(cat===selCat?' on':'');
    b.textContent=cat;
    if(cat===selCat){b.style.borderColor=CC[cat];b.style.color=CC[cat];}
    b.addEventListener('click',()=>{ selCat=cat; renderManage(); });
    cb.appendChild(b);
  });
}

document.getElementById('b-back-manage').addEventListener('click',()=>{ SFX.select(); show('s-title'); });
document.getElementById('b-add').addEventListener('click', addChore);
document.getElementById('new-name').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('new-desc').focus(); });

async function addChore() {
  const nameEl = document.getElementById('new-name');
  const descEl = document.getElementById('new-desc');
  const name = nameEl.value.trim().toUpperCase();
  if(!name) { nameEl.focus(); return; }
  if(!connected){ alert('NOT CONNECTED YET'); return; }
  SFX.choreDone();
  chores.push({ id:Date.now(), name, desc:descEl.value.trim().toUpperCase(), category:selCat });
  await saveChores();
  nameEl.value=''; descEl.value='';
  renderManage();
}

// ═══════════════════════════════════════════════════════════════
//  PLAYER SELECT
// ═══════════════════════════════════════════════════════════════
document.getElementById('b-back-player').addEventListener('click',()=>{ SFX.select(); show('s-title'); });
['you','partner'].forEach(p=>{
  document.getElementById('pc-'+p).addEventListener('click',()=>{
    SFX.select();
    player=p.toUpperCase();
    localStorage.setItem('cq-player',player);
    // Always start fresh
    running=false;
    clearTimeout(dtimer);
    board=null;
    sessionScore=0;
    sessionLines=0;
    showChoreList();
  });
});

// ═══════════════════════════════════════════════════════════════
//  CHORE LIST (MISSION SELECT)
// ═══════════════════════════════════════════════════════════════
function showChoreList() {
  show('s-chores');
  document.getElementById('chores-player-sub').textContent = 'PLAYING AS '+player;
  refreshChoreStats();
  renderMissions();
}

function refreshChoreStats() {
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('cs-you',     countBy('YOU'));
  set('cs-partner', countBy('PARTNER'));
  set('cs-total',   countToday()+'/'+chores.length);
  set('cs-score',   pad(sessionScore,6));
}

function renderMissions() {
  const el=document.getElementById('mission-list'); if(!el) return;
  el.innerHTML='';

  if(chores.length===0){
    el.innerHTML='<div style="font-size:9px;color:#6668aa;padding:20px;text-align:center;line-height:2">NO CHORES YET!<br>GO HOME → MANAGE CHORES</div>';
    return;
  }

  // pending first, done at bottom
  const pending = chores.filter(c=>!doneToday(c.id));
  const done    = chores.filter(c=>doneToday(c.id));

  if(pending.length===0){
    el.innerHTML='<div style="font-size:10px;color:#30d878;padding:20px;text-align:center;line-height:2;border:3px solid #30d878;background:rgba(48,216,120,.08);margin-bottom:12px">★ ALL DONE TODAY! ★<br><span style="font-size:7px;color:#6668aa">GREAT WORK TEAM!</span></div>';
  }

  [...pending,...done].forEach(c=>{
    const isDone = doneToday(c.id);
    const d=document.createElement('div');
    d.className='mission-item'+(isDone?' done':'');
    const cc=CC[c.category]||'#888';
    const who = whoDidIt(c.id);
    const when = whenDidIt(c.id);
    d.innerHTML=`
      <div class="mi-dot" style="background:${isDone?'#30d878':cc}"></div>
      <div class="mi-info">
        <div class="mi-name${isDone?' done':''}">${c.name}</div>
        ${c.desc?`<div class="mi-desc">${c.desc}</div>`:''}
        ${isDone?`<div class="mi-by">✓ ${who||'DONE'}${when?' AT '+fmtTime(when):''}</div>`:''}
      </div>
      <div class="mi-arrow">${isDone?'':'▶'}</div>`;
    if(!isDone){
      d.addEventListener('click',()=>{ SFX.select(); openDetail(c); });
    }
    el.appendChild(d);
  });
}

document.getElementById('b-back-chores').addEventListener('click',()=>{
  SFX.select(); running=false; clearTimeout(dtimer); show('s-player'); refreshAll();
});
document.getElementById('b-chores-scores').addEventListener('click',()=>{
  // show a quick score summary as an alert for now
  alert(`★ TODAY'S SCORES ★\n\nYOU: ${countBy('YOU')} chores\nPARTNER: ${countBy('PARTNER')} chores\nTOTAL: ${countToday()}/${chores.length}\n\nSESSION SCORE: ${pad(sessionScore)}\nHI-SCORE: ${pad(scores.hi)}\nBEST DAY: ${scores.bestDay} chores`);
});

// ═══════════════════════════════════════════════════════════════
//  CHORE DETAIL POPUP
// ═══════════════════════════════════════════════════════════════
let activeChore = null;

function openDetail(chore) {
  activeChore = chore;
  const isDone = doneToday(chore.id);
  const cc = CC[chore.category]||'#888';

  // populate
  const catEl = document.getElementById('d-cat');
  catEl.textContent = chore.category;
  catEl.style.color = cc; catEl.style.borderColor = cc;

  document.getElementById('d-name').textContent = chore.name;

  const descEl = document.getElementById('d-desc');
  if(chore.desc && chore.desc.trim()) {
    descEl.textContent = chore.desc;
    descEl.className = 'detail-desc-txt';
  } else {
    descEl.textContent = 'NO DESCRIPTION PROVIDED.';
    descEl.className = 'detail-desc-txt empty';
  }

  // last done info
  const lastEl = document.getElementById('d-last');
  const entries = Object.entries(log)
    .filter(([k])=>k.startsWith(chore.id+'|'))
    .map(([,v])=>v)
    .sort((a,b)=>b.at.localeCompare(a.at));
  if(entries.length>0) {
    const last = entries[0];
    const daysAgo = Math.floor((Date.now()-new Date(last.at))/86400000);
    const whenStr = daysAgo===0?'TODAY':daysAgo===1?'YESTERDAY':`${daysAgo} DAYS AGO`;
    lastEl.innerHTML = `LAST DONE: <span>${whenStr} BY ${last.by}</span>`;
  } else {
    lastEl.textContent = 'NEVER COMPLETED BEFORE';
  }

  // done stamp
  const stamp = document.getElementById('d-done-stamp');
  const completeBtn = document.getElementById('b-detail-complete');
  if(isDone) {
    stamp.style.display='block';
    document.getElementById('d-done-by').textContent = `BY ${whoDidIt(chore.id)||'UNKNOWN'} AT ${fmtTime(whenDidIt(chore.id))}`;
    completeBtn.style.display='none';
  } else {
    stamp.style.display='none';
    completeBtn.style.display='flex';
  }

  show('s-detail');
}

document.getElementById('b-back-detail').addEventListener('click',()=>{
  SFX.select(); activeChore=null; showChoreList();
});
document.getElementById('b-detail-back').addEventListener('click',()=>{
  SFX.select(); activeChore=null; showChoreList();
});

document.getElementById('b-detail-complete').addEventListener('click', async ()=>{
  if(!activeChore) return;
  if(!connected){ SFX.denied(); alert('NOT SYNCED — TRY AGAIN IN A MOMENT'); return; }
  SFX.choreDone();

  const choreToComplete = activeChore;
  activeChore = null;

  // Write to Firebase
  await writeLog(choreToComplete.id);
  const td = countToday();
  if(td > scores.bestDay){ scores.bestDay=td; await saveScores(); }

  // Show Tetris for this block drop!
  launchTetrisFor(choreToComplete);
});

// ═══════════════════════════════════════════════════════════════
//  TETRIS ENGINE
// ═══════════════════════════════════════════════════════════════
function launchTetrisFor(chore) {
  show('s-game');

  // Init canvases
  cvs  = document.getElementById('cvs');
  ctx  = cvs.getContext('2d');
  ncvs = document.getElementById('ncvs');
  nctx = ncvs.getContext('2d');
  CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell').trim())||24;
  cvs.width=COLS*CELL; cvs.height=ROWS*CELL;
  ncvs.width=4*CELL;   ncvs.height=4*CELL;

  // Init board if fresh session
  if(!board || !running) {
    board = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    sessionScore = 0;
    sessionLines = 0;
  }

  score   = sessionScore;
  lines   = sessionLines;
  running = true;
  clearTimeout(dtimer);

  // Show which chore was completed
  document.getElementById('g-notice-name').textContent = chore.name;
  document.getElementById('g-badge').textContent = player;

  // Spawn and immediately start dropping
  nxt = mkPiece();
  spawnNext();
  updateGameStats();
  drawBoard(); drawNext();

  // Drop the piece!
  dropLoop();
}

function mkPiece() {
  const k=rndPiece(), p=PIECES[k];
  return {k,s:p.s.map(r=>[...r]),c:p.c,x:Math.floor(COLS/2)-Math.floor(p.s[0].length/2),y:0};
}

function spawnNext() {
  cur=nxt; nxt=mkPiece();
  if(hits(cur,0,0)){ endGame(); return; }
  drawBoard(); drawNext();
}

function dropLoop() {
  if(!running) return;
  if(drop()) { dtimer=setTimeout(dropLoop,400); }
}

function drop() {
  if(!cur) return false;
  if(!hits(cur,0,1)){ cur.y++; drawBoard(); return true; }
  lockPiece(); return false;
}

function hits(p,dx,dy,sh) {
  const s=sh||p.s;
  for(let r=0;r<s.length;r++) for(let c=0;c<s[r].length;c++){
    if(!s[r][c]) continue;
    const nx=p.x+c+dx, ny=p.y+r+dy;
    if(nx<0||nx>=COLS||ny>=ROWS) return true;
    if(ny>=0&&board[ny][nx]) return true;
  }
  return false;
}

function lockPiece() {
  cur.s.forEach((row,r)=>row.forEach((v,c)=>{ if(v){const ny=cur.y+r;if(ny>=0)board[ny][cur.x+c]=cur.c;} }));
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
      score  += pts*(full.length>1?2:1);
      lines  += full.length;
      sessionScore=score; sessionLines=lines;
      SFX.lineClear();
      if(score>scores.hi){ scores.hi=score; await saveScores(); }
      updateGameStats(); drawBoard(); drawNext();
      // After clearing rows, piece locked — go back to chore list
      setTimeout(()=>returnToChoreList(), 600);
    },430);
  } else {
    sessionScore=score; sessionLines=lines;
    // Piece locked with no clear — go back to chore list
    setTimeout(()=>returnToChoreList(), 400);
  }
}

function flashRows(rows){
  const fx=document.getElementById('rfx'); fx.innerHTML='';
  rows.forEach(r=>{ const d=document.createElement('div'); d.className='rf'; d.style.top=(r*CELL)+'px'; fx.appendChild(d); });
  setTimeout(()=>fx.innerHTML='',460);
}

function returnToChoreList() {
  if(!running) return;
  // Don't reset board — keep it for next chore
  showChoreList();
}

async function endGame() {
  clearTimeout(dtimer); running=false;
  const td=countToday();
  if(score>scores.hi)   scores.hi=score;
  if(td>scores.bestDay) scores.bestDay=td;
  await saveScores();
  document.getElementById('over-title').textContent='GAME OVER';
  document.getElementById('o-score').textContent  = pad(score);
  document.getElementById('o-lines').textContent  = lines;
  document.getElementById('o-chores').textContent = td;
  document.getElementById('o-hi').textContent     = pad(scores.hi);
  show('s-over');
  SFX.gameOver();
}

// ── Drawing ───────────────────────────────────────────────────
function drawBoard(){
  if(!ctx) return;
  ctx.clearRect(0,0,cvs.width,cvs.height);
  ctx.strokeStyle='rgba(88,96,248,.1)'; ctx.lineWidth=1;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c]) blk(ctx,c,r,board[r][c]);
  if(cur){
    const g={...cur,s:cur.s.map(r=>[...r])};
    while(!hits(g,0,1)) g.y++;
    drawP(ctx,g,true); drawP(ctx,cur,false);
  }
}
function blk(c,col,row,color){
  const x=col*CELL,y=row*CELL;
  c.fillStyle=color; c.fillRect(x+1,y+1,CELL-2,CELL-2);
  c.fillStyle='rgba(255,255,255,.3)'; c.fillRect(x+1,y+1,CELL-2,3); c.fillRect(x+1,y+1,3,CELL-2);
  c.fillStyle='rgba(0,0,0,.35)'; c.fillRect(x+1,y+CELL-4,CELL-2,3); c.fillRect(x+CELL-4,y+1,3,CELL-2);
}
function drawP(c,p,ghost){
  p.s.forEach((row,r)=>row.forEach((v,col)=>{ if(v) blk(c,p.x+col,p.y+r,ghost?'rgba(200,200,255,.16)':p.c); }));
}
function drawNext(){
  if(!nctx) return;
  nctx.clearRect(0,0,ncvs.width,ncvs.height);
  if(!nxt) return;
  const s=nxt.s,ox=Math.floor((4-s[0].length)/2),oy=Math.floor((4-s.length)/2);
  s.forEach((row,r)=>row.forEach((v,c)=>{ if(v) blk(nctx,ox+c,oy+r,nxt.c); }));
}
function updateGameStats(){
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('g-score',   pad(score||0));
  set('g-lines',   String(lines||0).padStart(2,'0'));
  set('g-hi',      pad(scores.hi));
  set('g-today',   countToday());
  set('g-you',     countBy('YOU'));
  set('g-partner', countBy('PARTNER'));
  set('g-bestday', scores.bestDay);
  refreshChoreStats();
}

// ── Controls ──────────────────────────────────────────────────
function move(dx){ if(!cur||!running) return; if(!hits(cur,dx,0)){cur.x+=dx;SFX.move();drawBoard();} }
function rotate(){
  if(!cur||!running) return;
  const rot=rotateCW(cur.s);
  for(const dx of[0,1,-1,2,-2]){ if(!hits(cur,dx,0,rot)){cur.x+=dx;cur.s=rot;SFX.move();drawBoard();return;} }
}
function rotateCW(s){ const N=s.length; return Array.from({length:N},(_,r)=>Array.from({length:N},(_,c)=>s[N-1-c][r])); }

document.addEventListener('keydown',e=>{
  if(!document.getElementById('s-game').classList.contains('on')) return;
  if(e.key==='ArrowLeft')  move(-1);
  if(e.key==='ArrowRight') move(1);
  if(e.key==='ArrowDown')  { clearTimeout(dtimer); drop(); dtimer=setTimeout(dropLoop,400); }
  if(e.key==='ArrowUp'||e.key===' ') rotate();
});
document.getElementById('dp-l').addEventListener('click',()=>move(-1));
document.getElementById('dp-r').addEventListener('click',()=>move(1));
document.getElementById('dp-rot').addEventListener('click',rotate);
document.getElementById('dp-d').addEventListener('click',()=>{ clearTimeout(dtimer); drop(); dtimer=setTimeout(dropLoop,400); });

let t0=null;
document.addEventListener('touchstart',e=>{
  if(!document.getElementById('s-game').classList.contains('on')) return;
  if(['dp-l','dp-r','dp-rot','dp-d','b-ghome'].includes(e.target.id)) return;
  t0={x:e.touches[0].clientX,y:e.touches[0].clientY};
},{passive:true});
document.addEventListener('touchend',e=>{
  if(!t0||!running) return;
  const dx=e.changedTouches[0].clientX-t0.x, dy=e.changedTouches[0].clientY-t0.y;
  if(Math.abs(dx)<14&&Math.abs(dy)<14) rotate();
  else if(Math.abs(dx)>Math.abs(dy)) move(dx>0?1:-1);
  else if(dy>20) { clearTimeout(dtimer); drop(); dtimer=setTimeout(dropLoop,400); }
  t0=null;
},{passive:true});

document.getElementById('b-ghome').addEventListener('click',()=>{
  SFX.select(); clearTimeout(dtimer); running=false;
  board=null; sessionScore=0; sessionLines=0;
  show('s-title');
});

// ── Game over screen ──────────────────────────────────────────
document.getElementById('b-again').addEventListener('click',()=>{
  SFX.select();
  board=null; sessionScore=0; sessionLines=0;
  if(chores.length===0){ show('s-title'); return; }
  showChoreList();
});
document.getElementById('b-ohome').addEventListener('click',()=>{
  SFX.select();
  board=null; sessionScore=0; sessionLines=0;
  show('s-title');
});

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════
initFB();
show('s-title');
