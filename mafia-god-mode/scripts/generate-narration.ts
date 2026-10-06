// Records the narrator's script as audio clips with a text-to-speech service.
//
//   npx tsx scripts/generate-narration.ts --lang=en --provider=openai --dry-run
//   OPENAI_API_KEY=... npx tsx scripts/generate-narration.ts --lang=en,hi,ta --provider=openai --voice=onyx
//   ELEVENLABS_API_KEY=... npx tsx scripts/generate-narration.ts --lang=en --provider=elevenlabs --voice=<voice id>
//
// Clips go to public/narration/<lang>/<id>.mp3 with a manifest.json. The game plays a clip when one exists for a
// segment and speaks the rest (player names, anything not recorded) with the device voice. Existing clips are kept
// unless --force. Use --provider=silent to test the pipeline without a key or cost.
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clipId, recordableSegments } from "../shared/clips";
import { LANG_IDS, type Lang } from "../shared/script";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const langs = (args.lang ?? "en").split(",").filter((l): l is Lang => (LANG_IDS as string[]).includes(l));
const provider = args.provider ?? "openai";
const out = args.out ?? join(process.cwd(), "public", "narration");
const dry = args["dry-run"] === "true";
const force = args.force === "true";

const STYLE =
  "A deep, calm, theatrical storyteller narrating a game of Mafia around a table at night. Slow and deliberate with real pauses, " +
  "quietly ominous for the night, warmer at dawn, never rushed, never cartoonish. Speak the text exactly as written.";

async function tts(text: string, lang: Lang): Promise<{ bytes: Uint8Array; ext: string }> {
  if (provider === "silent") return { bytes: silentWav(), ext: "wav" };
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Set OPENAI_API_KEY.");
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: args.model ?? "gpt-4o-mini-tts", voice: args.voice ?? "onyx", input: text, instructions: STYLE + (lang === "en" ? "" : ` The language is ${lang === "hi" ? "Hindi" : "Tamil"}; speak it naturally with a native accent.`), response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), ext: "mp3" };
  }
  if (provider === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key || !args.voice) throw new Error("Set ELEVENLABS_API_KEY and pass --voice=<voice id>.");
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${args.voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: args.model ?? "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.35 } }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), ext: "mp3" };
  }
  throw new Error(`Unknown provider: ${provider}`);
}

/** A short silent WAV, for testing the pipeline. */
function silentWav(): Uint8Array {
  const rate = 8000, n = Math.floor(rate * 0.4), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  return new Uint8Array(buf);
}

async function main() {
let totalChars = 0;
for (const lang of langs) {
  const segments = recordableSegments(lang);
  const dir = join(out, lang);
  const manifestPath = join(dir, "manifest.json");
  const manifest: Record<string, string> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const todo = segments.filter((s) => force || !manifest[clipId(lang, s)]);
  const chars = todo.reduce((n, s) => n + s.length, 0);
  totalChars += chars;
  console.log(`${lang}: ${segments.length} segments, ${todo.length} to record, ${chars} characters`);
  if (dry) continue;
  mkdirSync(dir, { recursive: true });
  let done = 0;
  for (const seg of todo) {
    const id = clipId(lang, seg);
    const { bytes, ext } = await tts(seg, lang);
    writeFileSync(join(dir, `${id}.${ext}`), bytes);
    manifest[id] = `${id}.${ext}`;
    if (++done % 10 === 0) writeFileSync(manifestPath, JSON.stringify(manifest, null, 1)); // keep progress if interrupted
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log(`${lang}: wrote ${done} clips to ${dir}`);
}
if (dry) console.log(`Dry run: ${totalChars} characters in total. At typical TTS prices of roughly $0.015 to $0.30 per 1,000 characters, that is about $${(totalChars * 0.000015).toFixed(2)} to $${(totalChars * 0.0003).toFixed(2)}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
