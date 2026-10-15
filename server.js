const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const LEGACY_FILE = path.join(__dirname, 'games.json');
// Family PIN that protects the scores. Leave it empty only for local testing.
const FAMILY_PIN = (process.env.FAMILY_PIN || '').trim();

// ---------- Storage ----------

// Older versions saved { id, gameDate, players: [{ name, points }] }.
// Now a game is just a date and the players in finishing order.
function normalizeGame(game) {
    if (Array.isArray(game.order)) return game;
    return {
        id: String(game.id),
        date: game.gameDate,
        order: game.players.map(p => p.name),
        createdAt: Number(game.id) || Date.now()
    };
}

function loadGames() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // First start: bring over the games.json from the old version, if there is one
    if (!fs.existsSync(GAMES_FILE) && fs.existsSync(LEGACY_FILE)) {
        fs.copyFileSync(LEGACY_FILE, GAMES_FILE);
        console.log(`Imported old games from ${LEGACY_FILE}`);
    }
    if (!fs.existsSync(GAMES_FILE)) return [];

    const raw = fs.readFileSync(GAMES_FILE, 'utf8');
    if (raw.trim() === '') return [];
    return JSON.parse(raw).map(normalizeGame);
}

// Write to a temp file first, then rename, so a crash never leaves a half-written file
function saveGames() {
    const tmp = GAMES_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(games, null, 2));
    fs.renameSync(tmp, GAMES_FILE);
}

let games = loadGames();
console.log(`Loaded ${games.length} games from ${GAMES_FILE}`);

// ---------- App ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// The service worker must never be cached by the browser, or updates get stuck
app.get('/sw.js', (req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

function pinMatches(pin) {
    const a = Buffer.from(String(pin || ''));
    const b = Buffer.from(FAMILY_PIN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.use('/api', (req, res, next) => {
    if (!FAMILY_PIN || pinMatches(req.get('X-Family-Pin'))) return next();
    res.status(401).json({ error: 'wrong_pin' });
});

app.get('/api/games', (req, res) => {
    res.json(games);
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.post('/api/games', (req, res) => {
    const { id, date, order } = req.body || {};

    const validOrder = Array.isArray(order)
        && order.length >= 2 && order.length <= 8
        && order.every(n => typeof n === 'string' && n.trim() && n.length <= 40)
        && new Set(order).size === order.length;
    if (typeof date !== 'string' || !DATE_RE.test(date) || !validOrder) {
        return res.status(400).json({ error: 'invalid_game' });
    }

    // The phone sends its own id, so a double tap or a retry after a lost
    // connection never saves the same game twice
    const gameId = typeof id === 'string' && /^[\w-]{8,64}$/.test(id) ? id : crypto.randomUUID();
    const existing = games.find(g => g.id === gameId);
    if (existing) return res.status(200).json(existing);

    const game = { id: gameId, date, order: order.map(n => n.trim()), createdAt: Date.now() };
    games.push(game);
    saveGames();
    res.status(201).json(game);
});

app.delete('/api/games/:id', (req, res) => {
    const before = games.length;
    games = games.filter(g => g.id !== req.params.id);
    if (games.length === before) return res.status(404).json({ error: 'not_found' });
    saveGames();
    res.status(204).end();
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    if (!FAMILY_PIN) console.warn('FAMILY_PIN is not set: anyone with the link can change the scores.');
});
