// The narrator's script, in every language. Text uses "|" for a short pause and "||" for a long one,
// and {placeholders} for names, roles and times. English is the source; the Hindi and Tamil lines are
// first drafts that a native speaker should read through (see docs/NARRATION.md).

export type Lang = "en" | "hi" | "ta";
export const LANGS: { id: Lang; label: string; bcp47: string }[] = [
  { id: "en", label: "English", bcp47: "en-GB" },
  { id: "hi", label: "हिन्दी (Hindi)", bcp47: "hi-IN" },
  { id: "ta", label: "தமிழ் (Tamil)", bcp47: "ta-IN" },
];
export const LANG_IDS = LANGS.map((l) => l.id);

type Variants = Record<Lang, string[]>;
const v = (en: string[], hi: string[], ta: string[]): Variants => ({ en, hi, ta });

export const ROLE_WORDS: Record<string, Record<Lang, string>> = {
  mafia: { en: "Mafia", hi: "माफ़िया", ta: "மாஃபியா" },
  doctor: { en: "Doctor", hi: "डॉक्टर", ta: "டாக்டர்" },
  detective: { en: "Detective", hi: "जासूस", ta: "துப்பறிவாளர்" },
  villager: { en: "Villager", hi: "गाँव वाला", ta: "கிராமவாசி" },
  godfather: { en: "Godfather", hi: "गॉडफ़ादर", ta: "காட்ஃபாதர்" },
  jester: { en: "Jester", hi: "विदूषक", ta: "கோமாளி" },
  vigilante: { en: "Vigilante", hi: "निशानेबाज़", ta: "துப்பாக்கி வீரர்" },
};
/** "They were ___" phrases. */
export const WERE_WORDS: Record<string, Record<Lang, string>> = {
  mafia: { en: "a Mafia member", hi: "माफ़िया के सदस्य", ta: "மாஃபியா உறுப்பினர்" },
  doctor: { en: "the Doctor", hi: "डॉक्टर", ta: "டாக்டர்" },
  detective: { en: "the Detective", hi: "जासूस", ta: "துப்பறிவாளர்" },
  villager: { en: "a Villager", hi: "गाँव वाले", ta: "கிராமவாசி" },
  godfather: { en: "the Godfather", hi: "गॉडफ़ादर", ta: "காட்ஃபாதர்" },
  jester: { en: "the Jester", hi: "विदूषक", ta: "கோமாளி" },
  vigilante: { en: "the Vigilante", hi: "निशानेबाज़", ta: "துப்பாக்கி வீரர்" },
};

const S: Record<string, Variants> = {
  deal: v(
    ["Look at your phone. | Your role is for your eyes only. || Keep it secret."],
    ["अपना फ़ोन देखिए। | आपकी भूमिका सिर्फ़ आपके लिए है। || इसे राज़ रखिए।"],
    ["உங்கள் போனைப் பாருங்கள். | உங்கள் பாத்திரம் உங்களுக்கு மட்டுமே. || ரகசியமாக வைத்திருங்கள்."],
  ),
  "night.classic": v(
    [
      "Night falls on the village. || Everyone... close your eyes. | Keep them closed. | No peeking.",
      "The sun sets... | and the village falls silent. || Everyone, close your eyes.",
      "Darkness settles over the village. || Close your eyes, everyone. | Do not open them until I say so.",
    ],
    [
      "गाँव पर रात छा गई है। || सब लोग... आँखें बंद कर लीजिए। | आँखें बंद रखिए। | झाँकना मना है।",
      "सूरज ढल गया... | और गाँव में सन्नाटा छा गया। || सब लोग, आँखें बंद कीजिए।",
      "गाँव पर अँधेरा छा गया है। || सब लोग आँखें बंद कीजिए। | जब तक मैं न कहूँ, आँखें मत खोलिएगा।",
    ],
    [
      "கிராமத்தில் இரவு சூழ்கிறது. || எல்லோரும்... கண்களை மூடுங்கள். | மூடியபடியே இருங்கள். | எட்டிப் பார்க்கக் கூடாது.",
      "சூரியன் மறைந்தது... | கிராமம் அமைதியாகிறது. || எல்லோரும், கண்களை மூடுங்கள்.",
      "கிராமத்தின் மேல் இருள் கவிகிறது. || எல்லோரும் கண்களை மூடுங்கள். | நான் சொல்லும் வரை திறக்க வேண்டாம்.",
    ],
  ),
  "night.remote": v(
    ["Night falls on the village. | Night roles, check your phones."],
    ["गाँव पर रात छा गई है। | रात की भूमिका वाले, अपने फ़ोन देखिए।"],
    ["கிராமத்தில் இரவு சூழ்கிறது. | இரவுப் பாத்திரங்கள், உங்கள் போனைப் பாருங்கள்."],
  ),
  close: v(["{role}... close your eyes."], ["{role}... आँखें बंद कीजिए।"], ["{role}... கண்களை மூடுங்கள்."]),
  "open.mafia": v(
    ["Mafia... open your eyes. | Find your partners in the dark. || Choose... who will not see the morning.", "Mafia... wake up. | Silently agree on your victim."],
    ["माफ़िया... आँखें खोलिए। | अँधेरे में अपने साथियों को पहचानिए। || चुनिए... किसकी सुबह नहीं होगी।", "माफ़िया... जागिए। | चुपचाप तय कीजिए कि किसे निशाना बनाना है।"],
    ["மாஃபியா... கண்களைத் திறங்கள். | இருளில் உங்கள் கூட்டாளிகளைக் கண்டுபிடியுங்கள். || தேர்ந்தெடுங்கள்... யாருக்கு விடியல் இல்லை.", "மாஃபியா... எழுந்திருங்கள். | யாரைக் குறிவைப்பது என்று அமைதியாக முடிவு செய்யுங்கள்."],
  ),
  "open.doctor": v(
    ["Doctor... open your eyes. | Who will you protect tonight?", "Doctor... wake up. | Choose someone to save from the dark."],
    ["डॉक्टर... आँखें खोलिए। | आज रात आप किसे बचाएँगे?", "डॉक्टर... जागिए। | किसी को अँधेरे से बचाने के लिए चुनिए।"],
    ["டாக்டர்... கண்களைத் திறங்கள். | இன்றிரவு யாரைக் காப்பாற்றுவீர்கள்?", "டாக்டர்... எழுந்திருங்கள். | இருளிலிருந்து காப்பாற்ற ஒருவரைத் தேர்ந்தெடுங்கள்."],
  ),
  "open.detective": v(
    ["Detective... open your eyes. | Whose secret do you wish to uncover?", "Detective... wake up. | Choose someone to investigate."],
    ["जासूस... आँखें खोलिए। | आप किसका राज़ जानना चाहते हैं?", "जासूस... जागिए। | जाँच के लिए किसी को चुनिए।"],
    ["துப்பறிவாளர்... கண்களைத் திறங்கள். | யாருடைய ரகசியத்தை அறிய விரும்புகிறீர்கள்?", "துப்பறிவாளர்... எழுந்திருங்கள். | விசாரிக்க ஒருவரைத் தேர்ந்தெடுங்கள்."],
  ),
  "open.vigilante": v(
    ["Vigilante... open your eyes. | You carry a single bullet. || Will you use it tonight... or hold your fire?", "Vigilante... wake up. | Choose someone to shoot, or hold your fire."],
    ["निशानेबाज़... आँखें खोलिए। | आपके पास सिर्फ़ एक गोली है। || क्या आप आज रात उसका इस्तेमाल करेंगे... या रुकेंगे?", "निशानेबाज़... जागिए। | किसी को निशाना बनाइए, या गोली बचाकर रखिए।"],
    ["துப்பாக்கி வீரர்... கண்களைத் திறங்கள். | உங்களிடம் ஒரே ஒரு குண்டு உள்ளது. || இன்றிரவு அதைப் பயன்படுத்துவீர்களா... அல்லது காத்திருப்பீர்களா?", "துப்பாக்கி வீரர்... எழுந்திருங்கள். | யாரையாவது சுடுங்கள், அல்லது சுடாமல் இருங்கள்."],
  ),
  "remote.vigilante": v(["Vigilante, it is your turn. | Shoot someone, or hold your fire."], ["निशानेबाज़, आपकी बारी है। | किसी को निशाना बनाइए, या रुके रहिए।"], ["துப்பாக்கி வீரர், உங்கள் முறை. | யாரையாவது சுடுங்கள், அல்லது சுடாமல் இருங்கள்."]),
  "remote.mafia": v(["Mafia, it is your turn. | Agree on a victim."], ["माफ़िया, आपकी बारी है। | किसी एक शिकार पर सहमत हों।"], ["மாஃபியா, உங்கள் முறை. | ஒரு பலியாளை முடிவு செய்யுங்கள்."]),
  "remote.doctor": v(["Doctor, it is your turn. | Choose someone to save."], ["डॉक्टर, आपकी बारी है। | किसी को बचाने के लिए चुनिए।"], ["டாக்டர், உங்கள் முறை. | காப்பாற்ற ஒருவரைத் தேர்ந்தெடுங்கள்."]),
  "remote.detective": v(["Detective, it is your turn. | Choose someone to investigate."], ["जासूस, आपकी बारी है। | जाँच के लिए किसी को चुनिए।"], ["துப்பறிவாளர், உங்கள் முறை. | விசாரிக்க ஒருவரைத் தேர்ந்தெடுங்கள்."]),
  "dawn.open.classic": v(["The sun rises. || Everyone... open your eyes. || "], ["सूरज निकल आया। || सब लोग... आँखें खोलिए। || "], ["சூரியன் உதித்தது. || எல்லோரும்... கண்களைத் திறங்கள். || "]),
  "dawn.open.remote": v(["The sun rises. || "], ["सूरज निकल आया। || "], ["சூரியன் உதித்தது. || "]),
  "dawn.death": v(["Sadly... | {name} | was killed in the night."], ["दुख की बात है... | {name} | रात में मारे गए।"], ["வருத்தமான செய்தி... | {name} | இரவில் கொல்லப்பட்டார்."]),
  "dawn.role": v([" | They were {were}."], [" | वे {were} थे।"], [" | அவர் ஒரு {were}."]),
  "dawn.two": v(["Sadly... | {a} | and {b} | were killed in the night."], ["दुख की बात है... | {a} | और {b} | रात में मारे गए।"], ["வருத்தமான செய்தி... | {a} | மற்றும் {b} | இரவில் கொல்லப்பட்டனர்."]),
  "dawn.role.named": v([" | {name} was {were}."], [" | {name} {were} थे।"], [" | {name} ஒரு {were}."]),
  "dawn.none": v(
    ["And miraculously... | nobody died tonight.", "The village wakes... | and everyone is still alive."],
    ["और चमत्कार... | आज रात कोई नहीं मरा।", "गाँव जागा... | और सब ज़िंदा हैं।"],
    ["ஆச்சரியம்... | இன்றிரவு யாரும் இறக்கவில்லை.", "கிராமம் விழித்தது... | எல்லோரும் உயிருடன் இருக்கிறார்கள்."],
  ),
  day: v(
    ["The village gathers. | Someone among you is lying. || Discuss. | You have {time}."],
    ["गाँव इकट्ठा हुआ है। | आप में से कोई झूठ बोल रहा है। || चर्चा कीजिए। | आपके पास {time} हैं।"],
    ["கிராமம் ஒன்றுகூடுகிறது. | உங்களில் ஒருவர் பொய் சொல்கிறார். || விவாதியுங்கள். | உங்களுக்கு {time} உள்ளது."],
  ),
  "time.seconds": v(["{n} seconds"], ["{n} सेकंड"], ["{n} வினாடிகள்"]),
  "time.minute": v(["{n} minute"], ["{n} मिनट"], ["{n} நிமிடம்"]),
  "time.minutes": v(["{n} minutes"], ["{n} मिनट"], ["{n} நிமிடங்கள்"]),
  "vote.trial": v(
    ["Time is up. || Who do you suspect? | Cast your first vote. | It only decides who must defend themselves."],
    ["समय पूरा हुआ। || आपको किस पर शक है? | अपना पहला वोट दीजिए। | इससे सिर्फ़ यह तय होगा कि किसे सफ़ाई देनी होगी।"],
    ["நேரம் முடிந்தது. || யார் மீது சந்தேகம்? | முதல் வாக்கைப் போடுங்கள். | இது யார் தங்களை விளக்க வேண்டும் என்பதை மட்டுமே தீர்மானிக்கும்."],
  ),
  "vote.quick": v(
    ["Time is up. || Point at the one you suspect... | and cast your vote."],
    ["समय पूरा हुआ। || जिस पर शक है, उसकी ओर इशारा कीजिए... | और अपना वोट दीजिए।"],
    ["நேரம் முடிந்தது. || சந்தேகிக்கும் நபரைச் சுட்டிக்காட்டுங்கள்... | வாக்களியுங்கள்."],
  ),
  "tie.divided": v(["The village is divided. | Nobody is eliminated."], ["गाँव बँटा हुआ है। | किसी को बाहर नहीं किया जाएगा।"], ["கிராமம் பிரிந்து நிற்கிறது. | யாரும் வெளியேற்றப்படவில்லை."]),
  "tie.wait": v(["The village chooses to wait. | Nobody is eliminated."], ["गाँव ने इंतज़ार करना चुना। | किसी को बाहर नहीं किया जाएगा।"], ["கிராமம் காத்திருக்க முடிவு செய்தது. | யாரும் வெளியேற்றப்படவில்லை."]),
  "votes.one": v(["{n} vote"], ["{n} वोट"], ["{n} வாக்கு"]),
  "votes.many": v(["{n} votes"], ["{n} वोट"], ["{n} வாக்குகள்"]),
  elim: v(
    ["{name}... | the village has spoken. || You are eliminated, with {votes}."],
    ["{name}... | गाँव ने फ़ैसला सुना दिया है। || आप {votes} के साथ बाहर हो गए।"],
    ["{name}... | கிராமம் தீர்ப்பளித்துவிட்டது. || நீங்கள் {votes} உடன் வெளியேற்றப்படுகிறீர்கள்."],
  ),
  "elim.role": v([" || They were {were}."], [" || वे {were} थे।"], [" || அவர் ஒரு {were}."]),
  noaccuse: v(["The village cannot agree on anyone. | Nobody is accused."], ["गाँव किसी एक पर सहमत नहीं हो पाया। | इसलिए किसी पर आरोप नहीं।"], ["கிராமத்தால் யாரையும் முடிவு செய்ய முடியவில்லை. | யார் மீதும் குற்றச்சாட்டு இல்லை."]),
  "defense.two": v(["{a}... | and {b}. || You stand accused."], ["{a}... | और {b}। || आप पर आरोप है।"], ["{a}... | மற்றும் {b}. || உங்கள் மீது குற்றச்சாட்டு."]),
  "defense.one": v(["{a}... | you stand accused."], ["{a}... | आप पर आरोप है।"], ["{a}... | உங்கள் மீது குற்றச்சாட்டு."]),
  "defense.start": v(["The first votes are in. || {intro} || {call}"], ["पहले वोट आ गए हैं। || {intro} || {call}"], ["முதல் வாக்குகள் வந்துவிட்டன. || {intro} || {call}"]),
  "defense.first": v(["{name}... | the floor is yours. | You have {time} to defend yourself."], ["{name}... | अब आपकी बारी है। | अपनी सफ़ाई देने के लिए आपके पास {time} हैं।"], ["{name}... | இப்போது உங்கள் முறை. | உங்களை நிரூபிக்க {time} உள்ளது."]),
  "defense.next": v(["Now... | {name}. | Your turn. | You have {time} to defend yourself."], ["अब... | {name}। | आपकी बारी। | अपनी सफ़ाई देने के लिए आपके पास {time} हैं।"], ["இப்போது... | {name}. | உங்கள் முறை. | உங்களை நிரூபிக்க {time} உள்ளது."]),
  final: v(["The defenses are done. || Now... | cast your final vote. | Who will be eliminated?"], ["सफ़ाई पूरी हुई। || अब... | अपना अंतिम वोट दीजिए। | किसे बाहर किया जाए?"], ["விளக்கங்கள் முடிந்தன. || இப்போது... | இறுதி வாக்கைப் போடுங்கள். | யார் வெளியேற்றப்பட வேண்டும்?"]),
  "win.town": v(["The last Mafia is gone. || The Town wins!"], ["आख़िरी माफ़िया भी पकड़ा गया। || गाँव वालों की जीत हुई!"], ["கடைசி மாஃபியாவும் பிடிபட்டார். || கிராமவாசிகள் வெற்றி பெற்றனர்!"]),
  "win.jester": v(["The Jester has fooled the whole village. || The Jester wins!"], ["विदूषक ने पूरे गाँव को बेवकूफ़ बना दिया। || विदूषक जीत गया!"], ["கோமாளி முழு கிராமத்தையும் ஏமாற்றிவிட்டார். || கோமாளி வெற்றி பெற்றார்!"]),
  "win.mafia": v(["Darkness settles over the village for good. || The Mafia wins."], ["गाँव पर हमेशा के लिए अँधेरा छा गया। || माफ़िया जीत गया।"], ["கிராமத்தின் மேல் என்றென்றும் இருள் கவிந்தது. || மாஃபியா வெற்றி பெற்றது."]),
};

export type Vars = Record<string, string | number>;
export const fill = (s: string, vars: Vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/** One line of narration in a language. `pick` chooses among variants, so the game's random source stays in the game. */
export function say(lang: Lang, key: string, vars: Vars = {}, pick: <T>(xs: T[]) => T = (xs) => xs[0]): string {
  const entry = S[key];
  if (!entry) throw new Error(`Unknown narration key: ${key}`);
  const options = entry[lang]?.length ? entry[lang] : entry.en;
  return fill(pick(options), vars);
}

export const roleWord = (lang: Lang, role: string) => ROLE_WORDS[role]?.[lang] ?? role;
export const wereWord = (lang: Lang, role: string) => WERE_WORDS[role]?.[lang] ?? role;

/** "3 minutes", "45 seconds" in a language. */
export function spokenTime(lang: Lang, sec: number): string {
  if (sec < 60) return say(lang, "time.seconds", { n: sec });
  const m = Math.round(sec / 60);
  return say(lang, m === 1 ? "time.minute" : "time.minutes", { n: m });
}

/** Split narration into the pieces that are spoken one at a time, each with the pause that follows it. */
export function segmentsOf(text: string): { say: string; gap: number }[] {
  const out: { say: string; gap: number }[] = [];
  const parts = text.split(/(\|\|?)/);
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i].trim();
    const sep = parts[i + 1];
    if (piece) out.push({ say: piece, gap: sep === "||" ? 1400 : sep === "|" ? 650 : 0 });
  }
  return out;
}

/** Every key, for tests and the clip generator. */
export const SCRIPT_KEYS = Object.keys(S);
export const rawVariants = (key: string, lang: Lang) => S[key][lang];
