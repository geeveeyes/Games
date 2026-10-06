# Handoff

Status for whoever continues this project (Claude, ChatGPT, or a person).

## State

- Engine, API, React UI, unit tests and a five-player browser test are done and passing locally.
- Pushed to `geeveeyes/Games` under `mafia-god-mode/`.
- Deployed on Vercel with Upstash Redis attached by the owner. First deploy showed "Cannot reach the game server" (API response was not JSON); fixed by bundling the API and surfacing the HTTP status in the error. Re-verify with two phones after redeploy.

## Verify

```bash
cd mafia-god-mode && npm ci && npm run typecheck && npm test && npm run build
```

## Decisions made with the owner

Modes: in-person with TV, in-person phones-only, remote. Roles v1: Mafia, Villager, Doctor, Detective. Ties eliminate nobody. Doctor can self-save and can save the same person on consecutive nights (both host toggles, default on). Dead players do not see roles unless the host enables it. App name: Mafia God Mode.

## Narrator

Script lives in `shared/game.ts` (`narrate(text, cue)`; `|` = short pause, `||` = long pause). `src/narrator.ts` speaks it with Web Speech and drives `src/audio.ts` (Web Audio synth ambience and stings by cue). Fixed style chosen by ear: Google UK English Male, rate 1, pitch 0.5, music 60%; a single on/off button (needs one tap for browser audio). Voice quality depends on the device. Next upgrade: pre-generate recorded clips with a neural TTS and play those instead.

## Feedback

`shared/feedback.ts` (validation, rate limit, CSV), `functions/feedback.ts` (route), `src/Feedback.tsx` (form), `src/Admin.tsx` (`/#admin`). Redis list `mgm:feedback`; `docs/feedback.sql` is the SQL target. Needs `FEEDBACK_ADMIN_KEY` in Vercel to read entries. Browser test: `e2e/feedback.mjs`. `npm run build:api` bundles both `api/room.js` and `api/feedback.js`.

## Summary, history and stats

`Game.history` (events), `talkCounts` and `buildSummary` (awards) run as the game goes; `summary` is exposed in the view only when the game is over. `src/history.ts` keeps the private per-device history (localStorage). `shared/stats.ts` + `handler.syncRecord` save one anonymous record per finished game (`room.recordedGame` stops duplicates); `functions/stats.ts` serves `/api/stats` behind `FEEDBACK_ADMIN_KEY`; `src/Admin.tsx` has the Games tab.

## Roles

`Role` now includes godfather, jester, vigilante. Use `isMafiaRole(role)` (Mafia team) and `actsIn(role, step)` instead of comparing to `"mafia"`. The Detective checks `role === "mafia"`, so the Godfather reads as innocent on purpose. Vigilante has a night step (`vigilantePick`, `"skip"` = hold fire, `vigilanteUsed`). Jester wins via `resolveVote` (`winner: "jester"`). Ghost chat is `Talk.ghost`, filtered in `viewFor`. Adding a role means: `Role`, `roleCounts`, deck in `start`, script role words in `shared/script.ts` (all languages), bot behaviour, `ROLE_INFO` and a card colour in the UI, a compat fixture, and a case in `tests/roles.test.ts`. `tests/simulation.test.ts` plays 45 full games with every role and language.

## Narration script and clips

`shared/script.ts` holds every narrated line in English/Hindi/Tamil (`say`, `spokenTime`, `segmentsOf`). `shared/clips.ts` names recordable segments; `scripts/generate-narration.ts` records them; `src/narrator.ts` plays clip-or-TTS per segment and picks a voice per language. Hindi/Tamil need native review. Details in `docs/NARRATION.md`. Remember to restart the dev API after engine changes before running browser tests.

## Narrator lifecycle

Turning the narrator on mid-game: `enable()` speaks the latest line immediately (synchronously in the tap, which iOS needs), sets the music for the current phase, and records `lastSeq` so the line is not repeated. `e2e/narrator-midgame.mjs` stubs speech and checks this.

`useNarrator` stops speech and music whenever the room view is gone (leaving a room). `e2e/solo.mjs` counts live Web Audio nodes after leaving and fails if any remain.

## Rooms directory

`Settings.visibility` (`private` default, `open`, `ask`) and `roomName`. `handler.syncIndex` keeps the Redis set `mgm:open` in step with each room (listed = lobby phase, not private, has a human). `handleRooms` reads it. Join requests live in `game.pending`; kicks in `game.blocked`. Browser tests: `e2e/rooms.mjs`.

## Bots

`shared/bots.ts`. Bots act lazily inside `tick()` (no timers), with random delays stored in `room.bots`; `room.botNext` makes polls write when a bot is due. Table talk is `game.talk` (`say`). Dialogue is templated per persona; swap `LINES`/`act` for an LLM call to upgrade it.

## Next steps, in order

1. Deploy to Vercel with Upstash Redis and play one real game on phones.
2. Fix whatever the real game shows (timers, narration wording, small-screen layout).
3. Add Godfather and Jester roles, QR join, PWA icons, rejoin-by-name.

## Saved-room compatibility (read before changing the game's saved shape)

Rooms live in Redis for hours, so a deploy loads rooms saved by older code. Anything that adds or renames a field on `Game`, `Settings` or `RoomData` must keep old rooms working:

- Give the field a default in `DEFAULT_SETTINGS` / the `Game` class and handle it in `normalizeSettings` / `Game.fromJSON` (`shared/game.ts`). `fromJSON` runs on every load.
- Add the older shape to `shared/legacyFixtures.ts` and a case in `tests/compat.test.ts`.
- New lobby choices go in `shared/options.ts` (the UI renders from it and `tests/settings.test.ts` tries every value).
- `npm run e2e:settings` (with `MGM_SEED_OLD_ROOM=1 CHECK_OLD_ROOM=1`, see the script header) clicks every lobby control in a fresh room and in an old-format room.

## Keeping text boxes alive across phases

The chat box is rendered in `PlayerScreen` as a sibling after the phase body (`PlayerScreenBody`), never inside a phase's own JSX, so React keeps it mounted when the phase changes. Do not move `TalkBox` back into individual phase screens: a remount wipes a half-typed message and closes the phone keyboard. Any new text input should live in a stable place too. `e2e/typing-phase.mjs` and `e2e/feedback-in-room.mjs` guard this. `Ambience.stop()` is a fast fade for leaving a room, and `Scene.quiet()` stops new howls the moment a scene is told to fade.

## Gotchas

- `api/room.js` is generated by `npm run build:api` (esbuild) and committed so Vercel never compiles TypeScript for the API. Edit `functions/room.ts` or `shared/`, then rebuild and commit it. `npm run build` does this automatically.
- `package.json` is deliberately not `"type": "module"` so Vercel compiles `api/` and `shared/` as CommonJS.
- Timers are lazy (`shared/room.ts`). Never add `setTimeout` for game logic. It will not survive serverless.
- Secrets live only in `Game`; always expose state through `viewFor`.

## Latest round (feedback CSV + Telugu/Tamil + Bomber)
- Narration languages: en, te, ta, hi. Tamil/Telugu use a casual spoken register; all are first drafts needing native review.
- Bomber role (`useBomber`, ~8+ players): Mafia-side, knows the Mafia, unknown to them, reads innocent to the Detective. Wakes first at night; may detonate once (kills itself plus one non-Mafia target before the Doctor/Detective act) or wait. Counts toward Mafia parity; town wins when no Mafia remain.
- Feedback fixes: two Detectives, final-vote scope, vote reveal, speech-paced night, narrator queue, "Welcome back" bar with two-tap Leave game.
- User decisions: FEEDBACK_ADMIN_KEY is set; recorded-voice API key not needed.
