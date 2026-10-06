# Narration

## How a line is spoken

The engine writes each line of narration in the room's language (`Settings.language`: English, Hindi or Tamil) from `shared/script.ts`. Text uses `|` for a short pause and `||` for a long one. The line is split into segments, and each segment is played one of two ways:

1. **Recorded clip**, if one exists for that exact segment and language (`public/narration/<lang>/<id>.mp3`, listed in `manifest.json`).
2. **Device voice**, otherwise. This always covers player names, and everything if no clips have been recorded.

A line like "Sadly... | Priya | was killed in the night." plays clip, device voice (the name), clip.

## Recording the clips

About 90 segments per language, 7,100 characters in total (a few dollars at most).

```bash
npx tsx scripts/generate-narration.ts --lang=en,hi,ta --dry-run          # counts and cost estimate
OPENAI_API_KEY=... npx tsx scripts/generate-narration.ts --lang=en,hi,ta --provider=openai --voice=onyx
ELEVENLABS_API_KEY=... npx tsx scripts/generate-narration.ts --lang=en --provider=elevenlabs --voice=<voice id>
```

Commit the generated `public/narration/` folder and deploy. Existing clips are kept; use `--force` to re-record. Clip names are a hash of the language and the segment text (`shared/clips.ts`), so changing a line only needs that line re-recorded, and `tests/script.test.ts` pins the hash so ids cannot change by accident.

Audition one or two clips before recording everything. For a human feel, a deep calm voice works best, and the generator asks for a slow, theatrical delivery with real pauses.

## Hindi and Tamil

The Hindi and Tamil lines are first drafts written for this project. Have a native speaker read `shared/script.ts` and fix wording before recording. Device voices for these languages vary: Chrome on Android usually has good Hindi and Tamil voices, other devices may not. If a device has no voice for the language, the text still shows on screen.

Bot table talk and the interface text are still English.

## Adding or changing a line

Edit `shared/script.ts` (all three languages, same `{placeholders}`), run the tests, then re-run the generator. `tests/script.test.ts` checks every language has every line with matching placeholders and that whole games read cleanly in each language.
