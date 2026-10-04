# Mafia God Mode

A web app that replaces the human moderator in Mafia. Everyone plays. Nobody narrates.

The app deals secret roles, speaks the night script, collects each private action on the player's own phone, announces who died at dawn, runs the vote, and declares the winner.

## How it works

- **Phones** are each player's private channel: role card, night action, vote.
- **Narrator** speaks a slower, theatrical script with timed pauses, using the best English voice on the device (natural/neural voices are preferred; there is a voice, speed and pitch control). Generated ambient music shifts with the phase (night drone and distant howls, daylight chimes, a heartbeat during votes) with sound cues for dawn, a death and the win, and it ducks under the voice. Everything is synthesized in the browser, with no audio files. Turn it on from the "Narrator" button on one device (the TV/laptop or the host's phone), since browsers need a tap before they play sound.
- **Table screen** (optional): open the site on a TV or laptop, enter the room code, and choose **Show on TV**.
- **Modes** (chosen in the lobby): in person with a TV, in person phones-only, or remote on a video call (no eyes-closed step).

## Roles and rules (v1)

Mafia, Doctor, Detective, Villager. Suggested mix by player count: `floor(n/3)` Mafia, 1 Doctor, 1 Detective, the rest Villagers (4 to 20 players).

Voting styles (host setting): **Trial** (default) runs a first vote to find suspects, gives the top one or two accused a timed defense, then holds a final vote; **Quick** is a single vote. Ties, or a lead for "skip", eliminate nobody. An in-app **Rules** page explains everything.

Host settings: Doctor on/off, Detective on/off, Doctor self-save (default on), same-person save on consecutive nights (default on), Mafia count, reveal role on death, dead players see all roles, discussion and voting timers. Tied votes eliminate nobody.

Night order: Mafia, Doctor, Detective. If a night role is dead, the app still waits a random few seconds so nobody can tell. Mafia must agree on one victim. Players never learn who the Doctor saved.

## Run locally

```bash
npm install
npm run dev        # API on :3001 (in-memory rooms) + Vite on :5173
npm test           # engine + full API game tests
npm run typecheck
npm run e2e        # five browser players + a TV play a whole game (needs Chromium; see e2e/play.mjs)
```

Open `http://localhost:5173` on several browser windows or phones on the same network (`vite --host`).

## Architecture

```text
shared/game.ts     pure rules engine (no timers, no I/O); `viewFor` is the only way state leaves it
shared/room.ts     lazy timers: every request applies whatever transition is due
shared/handler.ts  framework-agnostic request handler (create/join/poll/act)
shared/store.ts    Redis (Upstash REST) in production, memory locally
functions/room.ts  Vercel function source (POST /api/room)
api/room.js        generated single-file bundle of the above; this is what Vercel runs (`npm run build:api`)
src/               React client (polls every 1 to 2 seconds)
```

Vercel functions cannot hold WebSockets or timers, so the server stores each room as one JSON document, clients poll, and each poll or action runs `tick()` to apply deadlines (night steps, dawn, vote end). A per-room lock in Redis prevents lost updates. The server is the only place roles live. Each client is sent only what that player may know.

## Deploy to Vercel

1. Import `geeveeyes/Games` in Vercel and set **Root Directory** to `mafia-god-mode`. The Vite preset is detected automatically.
2. In the project's **Storage** tab, add **Upstash Redis** (Marketplace). It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which the app reads. No other configuration is needed.
3. Deploy. Open the URL on every phone.

Cost note: each client polls once every 1 to 2 seconds, about 5,000 to 10,000 Redis commands per player per hour. A family game night fits the Upstash free tier a few times a month. Heavier use costs pennies on pay-as-you-go.

Without Redis the API still runs, but rooms live in one function instance's memory and will break across Vercel instances. Use Redis in production.

## Roadmap

Studio-quality recorded narration (pre-generated clips), Godfather and Jester roles, QR join code, saved game history, sound effects, installable PWA icon set, and rejoin-by-name for lost phones.
