# Картаџии

A small scoreboard for the family card games. It runs on a server and installs on phones like an app (a PWA), with no app store. Every phone sees the same scores, and games saved without internet are sent once the phone is back online.

## Run it on your computer

```bash
npm install
npm start            # http://localhost:3000, no PIN
```

Set `FAMILY_PIN=1234` before `npm start` to try the PIN screen.

## Put it on the Hetzner server

You need Docker on the server and ports 80 and 443 open.

1. Point a domain at the server's IP (an A record). No domain? Use `<server-ip-with-dashes>.sslip.io`, for example `65-21-100-7.sslip.io`. It works without any setup.
2. Copy this folder to the server (for example with `git clone`).
3. Create the settings file and fill in the domain and a PIN:
   ```bash
   cp .env.example .env
   nano .env
   ```
4. Start it:
   ```bash
   docker compose up -d --build
   ```
   Caddy gets the HTTPS certificate on its own. Open `https://your-domain` on a phone.

To update after a change: `git pull && docker compose up -d --build`. If you changed anything in `public/`, bump `VERSION` in `public/sw.js` too, so the phones pick it up.

**Already running something on ports 80/443 (nginx etc.)?** Remove the `caddy` service from `docker-compose.yml`, add `ports: ["3000:3000"]` to `app`, and proxy your domain to `localhost:3000`.

## Old scores

On its first start the server copies the old `games.json` from the project root into its data volume. If the old version is already running on the server, copy its scores out first:

```bash
docker cp <old-container>:/app/games.json ./games.json
```

The scores then live in the `karti_data` volume. To make a backup:

```bash
docker compose cp app:/app/data/games.json ./backup-games.json
```

## Installing on the phones

* **Android (Chrome):** open the link and tap **Инсталирај** on the banner, or use the menu ⋮ → *Add to Home screen*.
* **iPhone (Safari):** tap Share ⬆️ → *Add to Home Screen*.

Type the family PIN once and the phone remembers it.

## Changing players or points

Everything is at the top of `public/app.js`: the `PLAYERS` list (name and photo) and `POINTS` (6, 4, 2, 1).
