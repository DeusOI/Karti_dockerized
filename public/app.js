// Players and their photos. To add or rename a player, change only this list.
const PLAYERS = [
    { name: 'Елена', photo: 'images/eli.jpg' },
    { name: 'Панче', photo: 'images/pance.jpg' },
    { name: 'Грозданка', photo: 'images/goci.jpg' },
    { name: 'Васил', photo: 'images/vase.jpg' }
];
const POINTS = [6, 4, 2, 1]; // Points for 1st, 2nd, 3rd and 4th place
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
const ORDINALS = ['прв', 'втор', 'трет', 'четврт'];
const HISTORY_PAGE = 20;

const $ = id => document.getElementById(id);

// ---------- Local storage (cache, unsent games, PIN) ----------

const store = {
    get(key, fallback) {
        try {
            const v = localStorage.getItem('karti.' + key);
            return v === null ? fallback : JSON.parse(v);
        } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem('karti.' + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
    }
};

let games = store.get('games', []);    // last copy from the server, so the app opens instantly and offline
let outbox = store.get('outbox', []);  // games saved on this phone that the server hasn't confirmed yet
let ranking = [];                      // names in the order they were tapped
let season = String(new Date().getFullYear());
let historyLimit = HISTORY_PAGE;
let offline = false;

// ---------- Helpers ----------

function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${Number(d)}.${Number(m)}.${y}`;
}

// Written out by hand because not every phone browser knows Macedonian dates
const WEEKDAYS = ['недела', 'понеделник', 'вторник', 'среда', 'четврток', 'петок', 'сабота'];
const MONTHS = ['јануари', 'февруари', 'март', 'април', 'мај', 'јуни', 'јули', 'август', 'септември', 'октомври', 'ноември', 'декември'];

function formatLongDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return `${weekday[0].toUpperCase() + weekday.slice(1)}, ${d} ${MONTHS[m - 1]} ${y}`;
}

function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function playerPhoto(name) {
    const p = PLAYERS.find(p => p.name === name);
    return p ? p.photo : null;
}

// A round photo, or the first letter when there's no photo
function avatar(name, className) {
    const photo = playerPhoto(name);
    if (photo) {
        const img = document.createElement('img');
        img.className = className;
        img.src = photo;
        img.alt = '';
        return img;
    }
    const span = document.createElement('span');
    span.className = className + ' avatar-letter';
    span.textContent = name.charAt(0);
    return span;
}

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

let toastTimer;
function toast(message) {
    const t = $('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function confirmDialog(text) {
    return new Promise(resolve => {
        $('confirm-text').textContent = text;
        $('confirm').hidden = false;
        const done = answer => {
            $('confirm').hidden = true;
            $('confirm-yes').onclick = $('confirm-no').onclick = null;
            resolve(answer);
        };
        $('confirm-yes').onclick = () => done(true);
        $('confirm-no').onclick = () => done(false);
    });
}

// ---------- Server ----------

class PinError extends Error { }

async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-Family-Pin': store.get('pin', ''),
            ...(options.headers || {})
        }
    });
    if (res.status === 401) {
        showPin(Boolean(store.get('pin', '')));
        throw new PinError();
    }
    return res;
}

async function refresh() {
    try {
        const res = await api('/api/games');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        games = await res.json();
        store.set('games', games);
        offline = false;
    } catch (e) {
        if (!(e instanceof PinError)) offline = true;
    }
    renderAll();
}

// Send games saved on this phone. Stops at the first network error and tries again later.
async function flushOutbox() {
    while (outbox.length) {
        const game = outbox[0];
        try {
            const res = await api('/api/games', { method: 'POST', body: JSON.stringify(game) });
            if (!res.ok && res.status !== 400) throw new Error('HTTP ' + res.status);
        } catch {
            return;
        }
        // Saved (or rejected as invalid, which retrying won't fix)
        outbox.shift();
        store.set('outbox', outbox);
    }
}

async function sync() {
    await flushOutbox();
    await refresh();
}

// Server games plus the ones still waiting to be sent, newest first
function allGames() {
    const known = new Set(games.map(g => g.id));
    const pending = outbox.filter(g => !known.has(g.id)).map(g => ({ ...g, pending: true }));
    return games.concat(pending).sort((a, b) =>
        b.date.localeCompare(a.date) || (b.createdAt || Infinity) - (a.createdAt || Infinity));
}

// ---------- New game ----------

function renderPlayers() {
    const box = $('players');
    box.innerHTML = '';
    PLAYERS.forEach(p => {
        const place = ranking.indexOf(p.name);
        const btn = el('button', 'player' + (place >= 0 ? ' ranked place-' + (place + 1) : ''));
        btn.type = 'button';
        btn.setAttribute('aria-pressed', place >= 0);
        btn.append(avatar(p.name, 'player-img'), el('span', 'player-name', p.name));
        btn.append(el('span', 'place-points', place >= 0 ? `${place + 1}. место · +${POINTS[place]}` : ''));
        if (place >= 0) btn.append(el('span', 'place-medal', MEDALS[place]));
        btn.addEventListener('click', () => tapPlayer(p.name));
        box.append(btn);
    });

    const done = ranking.length === PLAYERS.length;
    $('save').disabled = !done;
    $('rank-hint').textContent = done
        ? 'Готово! Проверете и зачувајте.'
        : ranking.length === 0
            ? 'Допрете ги играчите по редот како завршија. Кој е прв?'
            : `Кој е ${ORDINALS[ranking.length]}?`;
}

function tapPlayer(name) {
    const i = ranking.indexOf(name);
    if (i >= 0) {
        ranking.splice(i, 1);
    } else {
        ranking.push(name);
        // Only one left: they must be last
        const left = PLAYERS.filter(p => !ranking.includes(p.name));
        if (left.length === 1) ranking.push(left[0].name);
    }
    renderPlayers();
}

function saveGame() {
    if (ranking.length !== PLAYERS.length) return;
    const game = { id: newId(), date: $('game-date').value || todayISO(), order: ranking.slice(), createdAt: Date.now() };

    outbox.push(game);
    store.set('outbox', outbox);
    ranking = [];
    season = game.date.slice(0, 4);
    renderAll();
    toast(`Зачувано! 🎉 ${game.order[0]} победи.`);

    // If there's no internet the game stays on the phone and the status line says so
    sync();
}

// ---------- Standings ----------

function seasonGames() {
    const all = allGames();
    return season === 'all' ? all : all.filter(g => g.date.startsWith(season));
}

function computeStandings(list) {
    const stats = new Map();
    const row = name => {
        if (!stats.has(name)) stats.set(name, { name, points: 0, wins: 0, games: 0 });
        return stats.get(name);
    };
    PLAYERS.forEach(p => row(p.name));
    list.forEach(g => g.order.forEach((name, i) => {
        const s = row(name);
        s.points += POINTS[i] || 0;
        s.games += 1;
        if (i === 0) s.wins += 1;
    }));

    const rows = [...stats.values()].sort((a, b) =>
        b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'mk'));
    // Equal points: more wins goes higher. Same points and wins share the place.
    rows.forEach((r, i) => {
        const prev = rows[i - 1];
        r.rank = prev && prev.points === r.points && prev.wins === r.wins ? prev.rank : i + 1;
    });
    return rows;
}

function renderSeasons() {
    const years = new Set(allGames().map(g => g.date.slice(0, 4)));
    years.add(String(new Date().getFullYear()));
    const options = [...years].sort().reverse().map(y => [y, y]).concat([['all', 'Сите']]);

    const box = $('seasons');
    box.innerHTML = '';
    options.forEach(([value, label]) => {
        const chip = el('button', 'chip' + (value === season ? ' active' : ''), label);
        chip.type = 'button';
        chip.setAttribute('role', 'tab');
        chip.setAttribute('aria-selected', value === season);
        chip.addEventListener('click', () => { season = value; renderAll(); });
        box.append(chip);
    });
    $('title').textContent = season === 'all' ? 'КАРТАЏИИ' : 'КАРТАЏИИ ' + season;
}

function winsLabel(n) { return n === 1 ? '1 победа' : `${n} победи`; }
function gamesLabel(n) { return n === 1 ? '1 партија' : `${n} партии`; }

function renderStandings() {
    const list = seasonGames();
    const rows = computeStandings(list);
    const box = $('standings');
    box.innerHTML = '';
    $('standings-empty').hidden = list.length > 0;
    $('share').hidden = list.length === 0;

    rows.forEach(r => {
        const li = el('li', 'standing' + (r.rank === 1 && list.length ? ' leader' : ''));
        li.append(
            el('span', 'standing-rank', r.rank <= 3 && list.length ? MEDALS[r.rank - 1] : String(r.rank)),
            avatar(r.name, 'standing-img')
        );
        const info = el('span', 'standing-info');
        info.append(el('span', 'standing-name', r.name), el('span', 'standing-sub', `${winsLabel(r.wins)} · ${gamesLabel(r.games)}`));
        const pts = el('span', 'standing-points');
        pts.append(el('strong', '', String(r.points)), el('small', '', 'поени'));
        li.append(info, pts);
        box.append(li);
    });
}

// ---------- History ----------

function renderHistory() {
    const list = allGames();
    const box = $('history');
    box.innerHTML = '';
    $('history-empty').hidden = list.length > 0;
    $('more').hidden = list.length <= historyLimit;

    let lastDate = null;
    list.slice(0, historyLimit).forEach(g => {
        if (g.date !== lastDate) {
            box.append(el('li', 'history-date', formatLongDate(g.date)));
            lastDate = g.date;
        }
        const li = el('li', 'game' + (g.pending ? ' pending' : ''));
        const order = el('ol', 'game-order');
        g.order.forEach((name, i) => {
            const item = el('li', 'game-player');
            item.append(el('span', 'game-medal', MEDALS[i] || String(i + 1)), avatar(name, 'game-img'), el('span', 'game-name', name));
            order.append(item);
        });
        li.append(order);
        if (g.pending) li.append(el('span', 'game-pending', '⏳ чека интернет'));

        const del = el('button', 'game-delete', '🗑');
        del.type = 'button';
        del.setAttribute('aria-label', 'Избриши партија');
        del.addEventListener('click', () => deleteGame(g));
        li.append(del);
        box.append(li);
    });
}

async function deleteGame(game) {
    const ok = await confirmDialog(`Дали сигурно сакате да ја избришете партијата од ${formatDate(game.date)}? (Победник: ${game.order[0]})`);
    if (!ok) return;

    if (game.pending) {
        outbox = outbox.filter(g => g.id !== game.id);
        store.set('outbox', outbox);
        renderAll();
        toast('Партијата е избришана.');
        return;
    }
    try {
        const res = await api('/api/games/' + encodeURIComponent(game.id), { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
        games = games.filter(g => g.id !== game.id);
        store.set('games', games);
        renderAll();
        toast('Партијата е избришана.');
    } catch (e) {
        if (!(e instanceof PinError)) toast('Не успеа бришењето. Проверете дали има интернет.');
    }
}

// ---------- Share standings as an image ----------

function loadImage(src) {
    return new Promise(resolve => {
        if (!src) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

async function drawStandingsImage() {
    const rows = computeStandings(seasonGames());
    const W = 1080, ROW = 150, TOP = 250;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = TOP + rows.length * (ROW + 20) + 60;
    const ctx = canvas.getContext('2d');
    const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    ctx.fillStyle = '#0f3d2e';
    ctx.fillRect(0, 0, W, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 64px ${font}`;
    ctx.fillText('♠ ♥ ' + $('title').textContent + ' ♦ ♣', W / 2, 110);
    ctx.fillStyle = '#b9d8c8';
    ctx.font = `400 36px ${font}`;
    ctx.fillText('Табела на ' + formatDate(todayISO()), W / 2, 175);

    const photos = await Promise.all(rows.map(r => loadImage(playerPhoto(r.name))));
    rows.forEach((r, i) => {
        const y = TOP + i * (ROW + 20);
        ctx.fillStyle = i === 0 ? '#fff4cc' : '#fbf7ee';
        roundRect(ctx, 40, y, W - 80, ROW, 28);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#1d1d1d';
        ctx.font = `700 60px ${font}`;
        ctx.fillText(r.rank <= 3 ? MEDALS[r.rank - 1] : String(r.rank), 110, y + 96);

        const cx = 235, cy = y + ROW / 2, rad = 52;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.clip();
        if (photos[i]) {
            const img = photos[i];
            const s = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, cx - rad, cy - rad, rad * 2, rad * 2);
        } else {
            ctx.fillStyle = '#c9b88f';
            ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }
        ctx.restore();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#1d1d1d';
        ctx.font = `700 50px ${font}`;
        ctx.fillText(r.name, 320, y + 70);
        ctx.fillStyle = '#5b5b5b';
        ctx.font = `400 32px ${font}`;
        ctx.fillText(`${winsLabel(r.wins)} · ${gamesLabel(r.games)}`, 320, y + 118);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0f3d2e';
        ctx.font = `800 72px ${font}`;
        ctx.fillText(String(r.points), W - 80, y + 98);
    });

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function shareStandings() {
    const blob = await drawStandingsImage();
    const name = `Tabela_${season}_${todayISO()}.png`;
    const file = new File([blob], name, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: $('title').textContent });
        } catch (e) {
            if (e.name !== 'AbortError') toast('Не успеа споделувањето.');
        }
        return;
    }
    // Computers and older phones: download the picture instead
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- PIN ----------

function showPin(wrong) {
    $('pin-error').hidden = !wrong;
    $('pin-screen').hidden = false;
    $('pin-input').value = '';
    setTimeout(() => $('pin-input').focus(), 50);
}

$('pin-form').addEventListener('submit', e => {
    e.preventDefault();
    store.set('pin', $('pin-input').value.trim());
    $('pin-screen').hidden = true;
    sync();
});

// ---------- Tabs, status, install ----------

function showTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === id));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

function renderStatus() {
    const s = $('sync-status');
    const waiting = outbox.length;
    if (waiting) {
        s.textContent = `⏳ ${waiting === 1 ? '1 партија чека' : waiting + ' партии чекаат'} интернет за да се испрати`;
    } else if (offline) {
        s.textContent = 'Нема интернет. Ги гледате последните зачувани резултати.';
    }
    s.hidden = !waiting && !offline;
}

function renderAll() {
    renderPlayers();
    renderSeasons();
    renderStandings();
    renderHistory();
    renderStatus();
}

function setupInstallHint() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone || store.get('installDismissed', false)) return;

    const banner = $('install');
    $('install-close').addEventListener('click', () => {
        banner.hidden = true;
        store.set('installDismissed', true);
    });

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
        $('install-text').textContent = 'Додадете ја апликацијата на почетниот екран: притиснете „Сподели“ ⬆️, па „Add to Home Screen“.';
        banner.hidden = false;
        return;
    }

    let deferred;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
        $('install-text').textContent = 'Инсталирајте ја апликацијата на телефонот за полесно отворање.';
        $('install-btn').hidden = false;
        banner.hidden = false;
    });
    $('install-btn').addEventListener('click', async () => {
        banner.hidden = true;
        if (deferred) {
            deferred.prompt();
            deferred = null;
        }
    });
}

// ---------- Start ----------

let dateChanged = false;
$('game-date').value = todayISO();
$('game-date').addEventListener('change', () => { dateChanged = true; });
$('save').addEventListener('click', saveGame);
$('clear').addEventListener('click', () => { ranking = []; renderPlayers(); });
$('share').addEventListener('click', shareStandings);
$('more').addEventListener('click', () => { historyLimit += HISTORY_PAGE; renderHistory(); });

window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // The app may have stayed open overnight
        if (!dateChanged) $('game-date').value = todayISO();
        sync();
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* works without it, just not offline */ });
}

setupInstallHint();
renderAll();
sync();
