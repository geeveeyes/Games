# Handoff

Status for whoever continues this project (Claude, ChatGPT, or a person).

## State

- Engine, API, React UI, unit tests and a five-player browser test are done and passing locally.
- Pushed to `geeveeyes/Games` under `mafia-god-mode/`.
- **Not yet done:** Vercel deployment (needs the owner to import the repo and attach Upstash Redis; see README "Deploy to Vercel").

## Verify

```bash
cd mafia-god-mode && npm ci && npm run typecheck && npm test && npm run build
```

## Decisions made with the owner

Modes: in-person with TV, in-person phones-only, remote. Roles v1: Mafia, Villager, Doctor, Detective. Ties eliminate nobody. Doctor can self-save and can save the same person on consecutive nights (both host toggles, default on). Dead players do not see roles unless the host enables it. App name: Mafia God Mode.

## Next steps, in order

1. Deploy to Vercel with Upstash Redis and play one real game on phones.
2. Fix whatever the real game shows (timers, narration wording, small-screen layout).
3. Add Godfather and Jester roles, QR join, PWA icons, rejoin-by-name.

## Gotchas

- `package.json` is deliberately not `"type": "module"` so Vercel compiles `api/` and `shared/` as CommonJS.
- Timers are lazy (`shared/room.ts`). Never add `setTimeout` for game logic. It will not survive serverless.
- Secrets live only in `Game`; always expose state through `viewFor`.
