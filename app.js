// ── Cupos requeridos en cancha ────────────────────────────
const SLOT_DEFS = [
  { id:0, cat:'M50', label:'Cupo M50'   },
  { id:1, cat:'M40', label:'Cupo M40'   },
  { id:2, cat:'M40', label:'Cupo M40'   },
  { id:3, cat:'M30', label:'Cupo M30'   },
  { id:4, cat:'M30', label:'Cupo M30'   },
  { id:5, cat:'M30', label:'Cupo M30'   },
  { id:6, cat:'LIB', label:'Cupo Libre' },
  { id:7, cat:'LIB', label:'Cupo Libre' },
];

const MIN_AGE     = { M50:50, M40:40, M30:30, LIB:0 };
const STORAGE_KEY = 'futbol8x8-lineup';

// Fallback si se abre como file:// sin servidor local
const FALLBACK_PLAYERS = [
  { id:1,  name:"Jhordy Lucero",    age:32, number:7   },
  { id:2,  name:"Walter Mallma",    age:44, number:3   },
  { id:3,  name:"Abel",             age:35, number:6   },
  { id:4,  name:"Jorge Yupanqui",   age:61, number:23  },
  { id:5,  name:"Frank Fuentes",    age:34, number:340 },
  { id:6,  name:"Truki",            age:31, number:10  },
  { id:7,  name:"Rodriguez botica", age:51, number:8   },
  { id:8,  name:"Coco",             age:32, number:15  },
  { id:9,  name:"Diego Y.",         age:24, number:19  },
  { id:10, name:"Cheche",           age:32, number:20  },
  { id:11, name:"Yober",            age:42, number:2   },
  { id:12, name:"Diego E.",         age:28, number:17  },
  { id:13, name:"Maycol",           age:23, number:13  },
  { id:14, name:"Canchita",         age:24, number:14  },
  { id:15, name:"Jose Pepian",      age:53, number:12  },
];

// ── Estado ───────────────────────────────────────────────
let allPlayers = [];
let starters   = [];
let subs       = [];
let selStarter = null;
let selSub     = null;
let infoTimer  = null;

// ── Helpers ──────────────────────────────────────────────
function getCategory(age) {
  if (age >= 50) return 'M50';
  if (age >= 40) return 'M40';
  if (age >= 30) return 'M30';
  return 'LIB';
}

function canFill(player, slotCat) {
  return player.age >= MIN_AGE[slotCat];
}

// ── Persistencia localStorage ─────────────────────────────
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    starterIds: starters.map(p => p.id),
    subIds:     subs.map(p => p.id),
  }));
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { starterIds, subIds } = JSON.parse(raw);
    const map = new Map(allPlayers.map(p => [p.id, p]));
    if (!Array.isArray(starterIds) || starterIds.length !== 8) return false;
    if (!Array.isArray(subIds)) return false;
    if (!starterIds.every(id => map.has(id))) return false;
    if (!subIds.every(id => map.has(id))) return false;
    starters = starterIds.map((id, i) => ({ ...map.get(id), cat: getCategory(map.get(id).age), slot: SLOT_DEFS[i] }));
    subs     = subIds.map(id => ({ ...map.get(id), cat: getCategory(map.get(id).age) }));
    return true;
  } catch { return false; }
}

// Asigna los jugadores del pool a los slots respetando categorías.
// Procesa slots de más restrictivo a menos (SLOT_DEFS ya está en ese orden).
// Por cada slot elige el jugador con la menor edad que califica ("ajuste justo"),
// evitando desperdiciar jugadores de categoría alta en slots bajos.
function buildStartersFromPool(pool) {
  const available = [...pool];
  return SLOT_DEFS.map(slot => {
    const minAge = MIN_AGE[slot.cat];
    const candidates = available
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.age >= minAge)
      .sort((a, b) => a.p.age - b.p.age);   // menor edad calificante primero

    const chosen = candidates.length > 0 ? candidates[0] : { p: available[0], i: 0 };
    available.splice(chosen.i, 1);
    return { ...chosen.p, cat: getCategory(chosen.p.age), slot };
  });
}

function resetToDefault() {
  starters   = buildStartersFromPool(allPlayers.slice(0, 8));
  subs       = allPlayers.slice(8).map(p => ({ ...p, cat: getCategory(p.age) }));
  selStarter = null;
  selSub     = null;
}

// ── Info bar ─────────────────────────────────────────────
const IDLE_MSG = 'Selecciona un jugador para ver opciones de cambio';

function setInfo(msg, type = '', autoClear = false) {
  clearTimeout(infoTimer);
  const bar = document.getElementById('infoBar');
  bar.textContent = msg;
  bar.className = `info-bar${type ? ' ' + type : ''}`;
  if (autoClear) infoTimer = setTimeout(() => setInfo(IDLE_MSG), 2200);
}

function updateInfo() {
  if (selStarter !== null) {
    const s = starters[selStarter];
    const n = subs.filter(sub => canFill(sub, s.slot.cat)).length;
    setInfo(`${s.name} seleccionado · ${n} suplente${n !== 1 ? 's' : ''} disponible${n !== 1 ? 's' : ''}`, 'active');
  } else if (selSub !== null) {
    const s = subs[selSub];
    const n = starters.filter(st => canFill(s, st.slot.cat)).length;
    setInfo(`${s.name} seleccionado · puede reemplazar a ${n} titular${n !== 1 ? 'es' : ''}`, 'active');
  }
}

// ── Mapas de clases CSS ───────────────────────────────────
const BADGE_CLASS = { M50:'bm50', M40:'bm40', M30:'bm30', LIB:'blib' };
const CAT_CLASS   = { M50:'cm50', M40:'cm40', M30:'cm30', LIB:'clib' };
const SLOT_CLASS  = { M50:'st50', M40:'st40', M30:'st30', LIB:'stlib' };

// ── Render ───────────────────────────────────────────────
function makeCard(p, isStarter, idx) {
  const card = document.createElement('div');
  card.className = `pcard ${CAT_CLASS[p.cat]}`;

  if (isStarter) {
    if (selStarter === idx)  card.classList.add('selected');
    else if (selSub !== null)
      card.classList.add(canFill(subs[selSub], p.slot.cat) ? 'compatible' : 'incompatible');
  } else {
    if (selSub === idx)          card.classList.add('selected');
    else if (selStarter !== null)
      card.classList.add(canFill(p, starters[selStarter].slot.cat) ? 'compatible' : 'incompatible');
  }

  const slotHtml = isStarter
    ? `<div class="slot-row">
         <span class="slot-lbl">Cupo:</span>
         <span class="slot-tag ${SLOT_CLASS[p.slot.cat]}">${p.slot.label}</span>
       </div>`
    : '';

  card.innerHTML = `
    <div class="card-row">
      <div class="p-num">#${p.number}</div>
      <div class="p-body">
        <div class="p-name">${p.name}</div>
        <div class="p-age">${p.age} años</div>
      </div>
      <div class="p-badge ${BADGE_CLASS[p.cat]}">${p.cat}</div>
    </div>
    ${slotHtml}
  `;

  card.addEventListener('click', isStarter ? () => onStarterClick(idx) : () => onSubClick(idx));
  return card;
}

function render() {
  const sl = document.getElementById('starterList');
  const su = document.getElementById('subList');
  sl.innerHTML = '';
  su.innerHTML = '';
  starters.forEach((p, i) => sl.appendChild(makeCard(p, true,  i)));
  subs.forEach    ((p, i) => su.appendChild(makeCard(p, false, i)));
}

// ── Swap ─────────────────────────────────────────────────
function doSwap(starterIdx, subIdx) {
  const slot = starters[starterIdx].slot;
  const tmp  = { ...subs[subIdx], slot };
  subs[subIdx] = { ...starters[starterIdx] };
  delete subs[subIdx].slot;
  starters[starterIdx] = tmp;
  saveState();
}

// ── Interacciones ────────────────────────────────────────
function onStarterClick(i) {
  if (selSub !== null) {
    const sub = subs[selSub], starter = starters[i];
    if (canFill(sub, starter.slot.cat)) {
      doSwap(i, selSub);
      setInfo(`✓ ${sub.name} entra por ${starter.name}`, 'success', true);
      selStarter = null; selSub = null;
    } else {
      setInfo(`✗ ${sub.name} (${sub.cat}) no cumple el cupo ${starter.slot.cat}`, 'error');
    }
  } else if (selStarter === i) {
    selStarter = null; setInfo(IDLE_MSG);
  } else {
    selStarter = i; selSub = null; updateInfo();
  }
  render();
}

function onSubClick(i) {
  if (selStarter !== null) {
    const sub = subs[i], starter = starters[selStarter];
    if (canFill(sub, starter.slot.cat)) {
      doSwap(selStarter, i);
      setInfo(`✓ ${sub.name} entra por ${starter.name}`, 'success', true);
      selStarter = null; selSub = null;
    } else {
      setInfo(`✗ ${sub.name} (${sub.cat}) no cumple el cupo ${starter.slot.cat}`, 'error');
    }
  } else if (selSub === i) {
    selSub = null; setInfo(IDLE_MSG);
  } else {
    selSub = i; selStarter = null; updateInfo();
  }
  render();
}

// ── Reset ────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  resetToDefault();
  render();
  setInfo('Alineación restablecida al estado inicial', 'success', true);
});

// ── Inicialización ───────────────────────────────────────
async function init() {
  try {
    const res = await fetch('players.json');
    if (!res.ok) throw new Error();
    const data = await res.json();
    allPlayers = data.players;
  } catch {
    allPlayers = FALLBACK_PLAYERS;
  }
  if (!restoreState()) resetToDefault();
  render();
  setInfo(IDLE_MSG);
}

init();
