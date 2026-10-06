# Mafia God Mode

A web app that replaces the human moderator in Mafia. Everyone plays. Nobody narrates.

The app deals secret roles, speaks the night script, collects each private action on the player's own phone, announces who died at dawn, runs the vote, and declares the winner.

## How it works

- **Phones** are each player's private channel: role card, night action, vote.
- **Narrator** speaks a slow, theatrical script with timed pauses, in English, Hindi or Tamil (the host picks in the lobby). It plays pre-recorded clips when they exist and otherwise uses the device's voice (a UK male voice for English when available). Generated ambient music (night drone and distant howls, daylight chimes, a heartbeat during votes, plus sound cues for dawn, a death and the win) plays at 60% and ducks under the voice. There is one on/off button, and it can be switched on at any point in a game. See [docs/NARRATION.md](docs/NARRATION.md) for recording clips and for the language notes.
- **Table screen** (optional): open the site on a TV or laptop, enter the room code, and choose **Show on TV**.
- **Modes** (chosen in the lobby): in person with a TV, in person phones-only, or remote on a video call (no eyes-closed step).

## Roles and rules (v1)

Mafia, Doctor, Detective, Villager. Suggested mix by player count: `floor(n/3)` Mafia, 1 Doctor, 1 Detective, the rest Villagers (4 to 20 players).

Voting styles (host setting): **Trial** (default) runs a first vote to find suspects, gives the top one or two accused a timed defense, then holds a final vote; **Quick** is a single vote. Ties, or a lead for "skip", eliminate nobody. An in-app **Rules** page explains everything.

Host settings: Doctor on/off, Detective on/off, Doctor self-save (default on), same-person save on consecutive nights (default on), Mafia count, reveal role on death, dead players see all roles, discussion and voting timers. Tied votes eliminate nobody.

Night order: Mafia, Doctor, Detective. If a night role is dead, the app still waits a random few seconds so nobody can tell. Mafia must agree on one victim. Players never learn who the Doctor saved.

## Feedback

Every screen has a **Feedback** button (and the end-of-game screen asks "How was the game?"). Players write in their own words, optionally pick a 1 to 5 rating and themes (narrator, voting, bots, rooms, looks, bugs, ideas). The server adds basic context (room code, phase, mode, player and bot counts). No names or contact details are collected, and the browser token is stored only as a short hash.

- **Storage:** a Redis list (`mgm:feedback`, newest 20,000), rate-limited to 6 per person per hour. `docs/feedback.sql` is the matching SQL table for when you want to move it to Postgres or Supabase.
- **Reading it:** open `/#admin`, enter the admin key, and filter by theme or download a CSV. Or call `GET /api/feedback` (JSON) / `?format=csv` with `Authorization: Bearer <key>`.
- **Set the key:** add an environment variable `FEEDBACK_ADMIN_KEY` in Vercel (at least 12 characters, random). Without it the read endpoint stays disabled, and sending feedback still works.

## Joining and installing

- **Invite link and QR code:** every lobby shows a QR code and a link (`/?room=ABCD`) with Copy and, on phones, Share. Opening the link shows the room name and host and joins in one step.
- **TV link:** `/?tv=ABCD` opens the shared screen directly, with a QR code for latecomers.
- **Install as an app:** the site ships a web app manifest, icons and a small service worker, so phones can add it to the home screen and it opens full-screen (Chrome shows an **Install** button; on iPhone use Share, then Add to Home Screen). Game traffic is never cached, so a new deploy shows up immediately.

## Staying connected

- A phone that sleeps or loses signal shows a "Reconnecting" banner, retries with a gentle back-off, and catches up the moment it is back. Players keep their seat because the browser remembers who they are.
- If a phone is lost or storage is cleared, the person can rejoin a running game by entering the room code and the **same name**. The seat (role, votes, notes, chat) moves to the new device once the old one has been quiet for a minute, so nobody can grab a seat that is in use.
- If the host stays away for a minute, the host role passes to another person so the game keeps moving. The host can also tap **Make host** in the lobby.
- Roster dots show who is connected.

## Rooms and joining

The host chooses who can join in the lobby, much like a Discord or Slack channel:

- **Private** (default): not listed; people need the 4-letter code.
- **Open**: listed under **Open rooms** on the home screen with one-tap **Join** and **Watch**.
- **Ask to join**: listed, and the host taps **Let in** or **Decline** for each person.

The host can name the room, and can remove anyone from the lobby (a removed person cannot rejoin that room). Rooms leave the list when the game starts, when set to Private, or when they expire. The directory is a Redis set (`mgm:open`) next to the room documents; stale entries clean themselves up when the list is read. Because anyone on the internet can see open rooms, keep rooms Private unless you want visitors.

## Replay value

- **Game summary:** when a game ends, everyone sees fun awards (Sharp eye, Guardian angel, Best liar, Most suspected, Dead eye, Friendly fire, Chatterbox, Perfect fool, Last one standing) and a "What happened" timeline with every night and day.
- **My games:** a private history and stats (games, wins, streaks, survival, favourite role, awards) kept only in the browser on that device. Nothing is sent anywhere. Open it from the home screen.
- **Usage stats for the owner:** one anonymous record per finished game (size, bots, winner, language, mode, options; no names, codes or browser ids) goes to Redis. Open `/#admin`, enter the admin key, and use the **Games** tab for totals, win rates, option popularity and games per day. This is the evidence for deciding what to build or charge for.

## Eliminated players

Players who are out get a **ghost chat** that only other eliminated players can see (so they can talk the game through without spoiling it) and can see who voted for whom during votes. Everyone sees everything once the game is over.

## Bots

The host can add bots in the lobby (**Add a bot**, **Fill to 6 players**, × to remove). Bots take real roles and play by the same rules as people:

- They confirm their role, act at night (Mafia bots agree on a victim, the Doctor and Detective choose), and vote in both rounds. A Detective bot uses what it learns; Mafia bots protect each other.
- They talk in the **table talk** feed during the day and defend themselves when accused. Each has one of three personalities (warm, blunt, playful). Mention a bot by name in the chat box and it answers.
- They act after random delays, so their speed never reveals their role. They are always labelled "bot".
- Bot lines are scripted templates, not an AI model, so there is no cost or API key. The code is in `shared/bots.ts`. To make the conversation more natural later, only the line generation needs to change.

One person plus bots can play a full game: `npm run e2e:solo`.

## Tests

- `npm test`: engine, bots, rooms, feedback, Redis protocol, **saved-room compatibility** (rooms saved by older versions still load and work) and **every lobby setting**.
- Browser tests (need Chromium; start `MGM_FAST=1 MGM_SEED_OLD_ROOM=1 npx tsx dev-server.ts` and `npx vite`): `npm run e2e` (5 players + TV), `e2e:solo` (one person + bots, also checks audio stops on leaving and chat typing), `e2e:settings` (every lobby control, fresh and old-format room), `e2e:typing` (text boxes keep focus while the room refreshes), `e2e:typingphase` (a half-typed chat message survives a phase change), `e2e:history` (game summary, My games, admin Games tab; needs `FEEDBACK_ADMIN_KEY`), `e2e:roles` (all optional roles on, ghost chat), `e2e:clips` (recorded clips play, names fall back to the device voice, Hindi narration), `e2e:invite` (QR decodes to the link, link joins, TV link, installable files; needs `vite preview` on :4173), `e2e:reliability` (offline banner, host handover, taking a seat back; start the API with `MGM_HEARTBEAT_MS=1000 MGM_AWAY_MS=4000`), `e2e:narrator` (turning the narrator on mid-game speaks immediately and starts the music).

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
