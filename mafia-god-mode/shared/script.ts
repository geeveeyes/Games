// The narrator's script, in every language. Text uses "|" for a short pause and "||" for a long one,
// and {placeholders} for names, roles and times. English is the source. Tamil and Telugu are written in a casual,
// spoken register (the way people actually talk around a table), not formal written language. Hindi, Tamil and
// Telugu are first drafts that a native speaker should read through (see docs/NARRATION.md).

export type Lang = "en" | "hi" | "ta" | "te";
export const LANGS: { id: Lang; label: string; bcp47: string }[] = [
  { id: "en", label: "English", bcp47: "en-GB" },
  { id: "te", label: "తెలుగు (Telugu)", bcp47: "te-IN" },
  { id: "ta", label: "தமிழ் (Tamil)", bcp47: "ta-IN" },
  { id: "hi", label: "हिन्दी (Hindi)", bcp47: "hi-IN" },
];
export const LANG_IDS = LANGS.map((l) => l.id);
const LANG_ORDER: Lang[] = ["en", "hi", "ta", "te"];

type Variants = Record<Lang, string[]>;
const v = (en: string[], hi: string[], ta: string[], te: string[]): Variants => ({ en, hi, ta, te });
const w = (en: string, hi: string, ta: string, te: string): Record<Lang, string> => ({ en, hi, ta, te });

export const ROLE_WORDS: Record<string, Record<Lang, string>> = {
  mafia: w("Mafia", "माफ़िया", "மாஃபியா", "మాఫియా"),
  doctor: w("Doctor", "डॉक्टर", "டாக்டர்", "డాక్టర్"),
  detective: w("Detective", "जासूस", "டிடெக்டிவ்", "డిటెక్టివ్"),
  villager: w("Villager", "गाँव वाला", "ஊர்க்காரர்", "ఊరివాడు"),
  godfather: w("Godfather", "गॉडफ़ादर", "காட்ஃபாதர்", "గాడ్‌ఫాదర్"),
  jester: w("Jester", "विदूषक", "ஜோக்கர்", "జోకర్"),
  vigilante: w("Vigilante", "निशानेबाज़", "துப்பாக்கிக்காரர்", "తుపాకీ వీరుడు"),
  bomber: w("Bomber", "बॉम्बर", "பாம்பர்", "బాంబర్"),
};
/** "They were ___" phrases. */
export const WERE_WORDS: Record<string, Record<Lang, string>> = {
  mafia: w("a Mafia member", "माफ़िया के सदस्य", "மாஃபியா ஆளு", "మాఫియా మనిషి"),
  doctor: w("the Doctor", "डॉक्टर", "டாக்டர்", "డాక్టర్"),
  detective: w("the Detective", "जासूस", "டிடெக்டிவ்", "డిటెక్టివ్"),
  villager: w("a Villager", "गाँव वाले", "சாதாரண ஊர்க்காரர்", "మామూలు ఊరివాడు"),
  godfather: w("the Godfather", "गॉडफ़ादर", "காட்ஃபாதர்", "గాడ్‌ఫాదర్"),
  jester: w("the Jester", "विदूषक", "ஜோக்கர்", "జోకర్"),
  vigilante: w("the Vigilante", "निशानेबाज़", "துப்பாக்கிக்காரர்", "తుపాకీ వీరుడు"),
  bomber: w("the Bomber", "बॉम्बर", "பாம்பர்", "బాంబర్"),
};

const S: Record<string, Variants> = {
  deal: v(
    ["Look at your phone. | Your role is for your eyes only. || Keep it secret."],
    ["अपना फ़ोन देखिए। | आपकी भूमिका सिर्फ़ आपके लिए है। || इसे राज़ रखिए।"],
    ["உங்க போனைப் பாருங்க. | உங்க கேரக்டர் உங்களுக்கு மட்டும்தான். || யார்கிட்டயும் சொல்லாதீங்க."],
    ["మీ ఫోన్ చూడండి. | మీ పాత్ర మీకు మాత్రమే. || ఎవరికీ చెప్పకండి."],
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
      "ஊருக்கு ராத்திரி வந்துடுச்சு. || எல்லாரும்... கண்ணை மூடிக்கோங்க. | திறக்காதீங்க. | எட்டிப் பாக்கக் கூடாது.",
      "சூரியன் மறைஞ்சிடுச்சு... | ஊரே அமைதியா போயிடுச்சு. || எல்லாரும் கண்ணை மூடிக்கோங்க.",
      "ஊர் மேல இருட்டு கவிஞ்சிடுச்சு. || எல்லாரும் கண்ணை மூடிக்கோங்க. | நான் சொல்ற வரைக்கும் திறக்காதீங்க.",
    ],
    [
      "ఊరిమీద రాత్రి పడింది. || అందరూ... కళ్ళు మూసుకోండి. | తెరవకండి. | తొంగి చూడొద్దు.",
      "సూర్యుడు అస్తమించాడు... | ఊరంతా నిశ్శబ్దంగా అయిపోయింది. || అందరూ కళ్ళు మూసుకోండి.",
      "ఊరిమీద చీకటి కమ్మేసింది. || అందరూ కళ్ళు మూసుకోండి. | నేను చెప్పే వరకు తెరవకండి.",
    ],
  ),
  "night.remote": v(
    ["Night falls on the village. | Night roles, check your phones."],
    ["गाँव पर रात छा गई है। | रात की भूमिका वाले, अपने फ़ोन देखिए।"],
    ["ஊருக்கு ராத்திரி வந்துடுச்சு. | ராத்திரி கேரக்டர்ஸ், உங்க போனைப் பாருங்க."],
    ["ఊరిమీద రాత్రి పడింది. | రాత్రి పాత్రలు, మీ ఫోన్ చూడండి."],
  ),
  close: v(["{role}... close your eyes."], ["{role}... आँखें बंद कीजिए।"], ["{role}... கண்ணை மூடிக்கோங்க."], ["{role}... కళ్ళు మూసుకోండి."]),
  "open.mafia": v(
    ["Mafia... open your eyes. | Find your partners in the dark. || Choose... who will not see the morning.", "Mafia... wake up. | Silently agree on your victim."],
    ["माफ़िया... आँखें खोलिए। | अँधेरे में अपने साथियों को पहचानिए। || चुनिए... किसकी सुबह नहीं होगी।", "माफ़िया... जागिए। | चुपचाप तय कीजिए कि किसे निशाना बनाना है।"],
    ["மாஃபியா... கண்ணைத் திறங்க. | இருட்டுல உங்க ஆளுங்களைக் கண்டுபிடிங்க. || யாருக்கு விடியலே இல்லன்னு... முடிவு பண்ணுங்க.", "மாஃபியா... எந்திரிங்க. | யாரைப் போடலாம்னு அமைதியா பேசி முடிவு பண்ணுங்க."],
    ["మాఫియా... కళ్ళు తెరవండి. | చీకట్లో మీ వాళ్ళని గుర్తుపట్టండి. || ఎవరికి తెల్లారదో... నిర్ణయించండి.", "మాఫియా... లేవండి. | ఎవరిని లేపేయాలో మెల్లగా మాట్లాడుకుని నిర్ణయించండి."],
  ),
  "open.doctor": v(
    ["Doctor... open your eyes. | Who will you protect tonight?", "Doctor... wake up. | Choose someone to save from the dark."],
    ["डॉक्टर... आँखें खोलिए। | आज रात आप किसे बचाएँगे?", "डॉक्टर... जागिए। | किसी को अँधेरे से बचाने के लिए चुनिए।"],
    ["டாக்டர்... கண்ணைத் திறங்க. | இன்னிக்கு ராத்திரி யாரைக் காப்பாத்தப் போறீங்க?", "டாக்டர்... எந்திரிங்க. | இருட்டுல இருந்து யாரைக் காப்பாத்தணும்னு தேர்ந்தெடுங்க."],
    ["డాక్టర్... కళ్ళు తెరవండి. | ఈ రాత్రి ఎవరిని కాపాడతారు?", "డాక్టర్... లేవండి. | చీకటి నుంచి ఎవరిని కాపాడాలో ఎంచుకోండి."],
  ),
  "open.detective": v(
    ["Detective... open your eyes. | Whose secret do you wish to uncover?", "Detective... wake up. | Choose someone to investigate."],
    ["जासूस... आँखें खोलिए। | आप किसका राज़ जानना चाहते हैं?", "जासूस... जागिए। | जाँच के लिए किसी को चुनिए।"],
    ["டிடெக்டிவ்... கண்ணைத் திறங்க. | யாரோட ரகசியத்தைத் தெரிஞ்சுக்கணும்?", "டிடெக்டிவ்... எந்திரிங்க. | யாரை விசாரிக்கணும்னு தேர்ந்தெடுங்க."],
    ["డిటెక్టివ్... కళ్ళు తెరవండి. | ఎవరి రహస్యం తెలుసుకోవాలి?", "డిటెక్టివ్... లేవండి. | ఎవరిని విచారించాలో ఎంచుకోండి."],
  ),
  "open.vigilante": v(
    ["Vigilante... open your eyes. | You carry a single bullet. || Will you use it tonight... or hold your fire?", "Vigilante... wake up. | Choose someone to shoot, or hold your fire."],
    ["निशानेबाज़... आँखें खोलिए। | आपके पास सिर्फ़ एक गोली है। || क्या आप आज रात उसका इस्तेमाल करेंगे... या रुकेंगे?", "निशानेबाज़... जागिए। | किसी को निशाना बनाइए, या गोली बचाकर रखिए।"],
    ["துப்பாக்கிக்காரர்... கண்ணைத் திறங்க. | உங்ககிட்ட ஒரே ஒரு குண்டுதான் இருக்கு. || இன்னிக்கு ராத்திரி சுடப்போறீங்களா... இல்ல பொறுமையா இருக்கப்போறீங்களா?", "துப்பாக்கிக்காரர்... எந்திரிங்க. | யாரையாவது சுடுங்க, இல்லன்னா சும்மா இருங்க."],
    ["తుపాకీ వీరుడు... కళ్ళు తెరవండి. | మీ దగ్గర ఒకే ఒక్క బుల్లెట్ ఉంది. || ఈ రాత్రి కాల్చేస్తారా... లేక ఆగుతారా?", "తుపాకీ వీరుడు... లేవండి. | ఎవరినైనా కాల్చండి, లేకపోతే ఆగండి."],
  ),
  "open.bomber": v(
    ["Bomber... open your eyes. | You know the Mafia, but they do not know you. || Will you blow yourself up tonight... and take one more with you?", "Bomber... wake up. | You may end your life and one more. || Detonate, or wait?"],
    ["बॉम्बर... आँखें खोलिए। | आप माफ़िया को जानते हैं, पर वे आपको नहीं जानते। || क्या आप आज रात किसी एक को साथ लेकर खुद को उड़ाएँगे?", "बॉम्बर... जागिए। | आप अपनी जान के साथ एक और जान ले सकते हैं। || उड़ाना है, या रुकना है?"],
    ["பாம்பர்... கண்ணைத் திறங்க. | மாஃபியா யாருன்னு உங்களுக்குத் தெரியும், ஆனா அவங்களுக்கு நீங்க யாருன்னு தெரியாது. || இன்னிக்கு ராத்திரி ஒருத்தரையும் கூட்டிட்டு வெடிக்கப் போறீங்களா?", "பாம்பர்... எந்திரிங்க. | உங்க உயிரோட இன்னொருத்தர் உயிரையும் எடுக்கலாம். || வெடிக்கணுமா, இல்ல காத்திருக்கணுமா?"],
    ["బాంబర్... కళ్ళు తెరవండి. | మాఫియా ఎవరో మీకు తెలుసు, కానీ మీరెవరో వాళ్ళకి తెలియదు. || ఈ రాత్రి ఒకరిని తీసుకుని పేల్చుకుంటారా?", "బాంబర్... లేవండి. | మీ ప్రాణంతో పాటు ఇంకొకరి ప్రాణం తీయవచ్చు. || పేల్చాలా, ఆగాలా?"],
  ),
  "remote.mafia": v(["Mafia, it is your turn. | Agree on a victim."], ["माफ़िया, आपकी बारी है। | किसी एक शिकार पर सहमत हों।"], ["மாஃபியா, உங்க டர்ன். | யாரைப் போடறதுன்னு ஒரு முடிவுக்கு வாங்க."], ["మాఫియా, మీ వంతు. | ఎవరిని లేపేయాలో నిర్ణయించండి."]),
  "remote.doctor": v(["Doctor, it is your turn. | Choose someone to save."], ["डॉक्टर, आपकी बारी है। | किसी को बचाने के लिए चुनिए।"], ["டாக்டர், உங்க டர்ன். | யாரைக் காப்பாத்தணும்னு தேர்ந்தெடுங்க."], ["డాక్టర్, మీ వంతు. | ఎవరిని కాపాడాలో ఎంచుకోండి."]),
  "remote.detective": v(["Detective, it is your turn. | Choose someone to investigate."], ["जासूस, आपकी बारी है। | जाँच के लिए किसी को चुनिए।"], ["டிடெக்டிவ், உங்க டர்ன். | யாரை விசாரிக்கணும்னு தேர்ந்தெடுங்க."], ["డిటెక్టివ్, మీ వంతు. | ఎవరిని విచారించాలో ఎంచుకోండి."]),
  "remote.vigilante": v(["Vigilante, it is your turn. | Shoot someone, or hold your fire."], ["निशानेबाज़, आपकी बारी है। | किसी को निशाना बनाइए, या रुके रहिए।"], ["துப்பாக்கிக்காரர், உங்க டர்ன். | யாரையாவது சுடுங்க, இல்லன்னா சும்மா இருங்க."], ["తుపాకీ వీరుడు, మీ వంతు. | ఎవరినైనా కాల్చండి, లేకపోతే ఆగండి."]),
  "remote.bomber": v(["Bomber, it is your turn. | Detonate, or wait?"], ["बॉम्बर, आपकी बारी है। | उड़ाना है, या रुकना है?"], ["பாம்பர், உங்க டர்ன். | வெடிக்கப் போறீங்களா, இல்ல காத்திருக்கப் போறீங்களா?"], ["బాంబర్, మీ వంతు. | పేల్చుకుంటారా, లేక ఆగుతారా?"]),
  "dawn.open.classic": v(["The sun rises. || Everyone... open your eyes. || "], ["सूरज निकल आया। || सब लोग... आँखें खोलिए। || "], ["பொழுது விடிஞ்சிடுச்சு. || எல்லாரும்... கண்ணைத் திறங்க. || "], ["తెల్లారింది. || అందరూ... కళ్ళు తెరవండి. || "]),
  "dawn.open.remote": v(["The sun rises. || "], ["सूरज निकल आया। || "], ["பொழுது விடிஞ்சிடுச்சு. || "], ["తెల్లారింది. || "]),
  "dawn.death": v(["Sadly... | {name} | was killed in the night."], ["दुख की बात है... | {name} | रात में मारे गए।"], ["ரொம்ப வருத்தமான விஷயம்... | {name} | ராத்திரி செத்துட்டாங்க."], ["చాలా బాధాకరం... | {name} | రాత్రి చనిపోయారు."]),
  "dawn.two": v(["Sadly... | {a} | and {b} | were killed in the night."], ["दुख की बात है... | {a} | और {b} | रात में मारे गए।"], ["ரொம்ப வருத்தமான விஷயம்... | {a} | அப்புறம் {b} | ரெண்டு பேரும் ராத்திரி செத்துட்டாங்க."], ["చాలా బాధాకరం... | {a} | మరియు {b} | ఇద్దరూ రాత్రి చనిపోయారు."]),
  "dawn.bomb": v(
    ["A bomb went off in the night! | {a} | and {b} | are dead. || {a} was the Bomber."],
    ["रात में बम फट गया! | {a} | और {b} | दोनों नहीं रहे। || {a} बॉम्बर थे।"],
    ["ராத்திரி ஒரு குண்டு வெடிச்சுடுச்சு! | {a} | அப்புறம் {b} | ரெண்டு பேரும் செத்துட்டாங்க. || {a} தான் பாம்பர்."],
    ["రాత్రి బాంబు పేలింది! | {a} | మరియు {b} | ఇద్దరూ చనిపోయారు. || {a} బాంబర్."],
  ),
  "dawn.also": v(["Also... | {names} | did not survive."], ["इतना ही नहीं... | {names} | भी नहीं बचे।"], ["அதுமட்டுமில்ல... | {names} | உயிரோட இல்ல."], ["అంతే కాదు... | {names} | కూడా బతికి లేరు."]),
  "dawn.role": v([" | They were {were}."], [" | वे {were} थे।"], [" | அவங்க ஒரு {were}."], [" | వాళ్ళు {were}."]),
  "dawn.role.named": v([" | {name} was {were}."], [" | {name} {were} थे।"], [" | {name} ஒரு {were}."], [" | {name} {were}."]),
  "dawn.none": v(
    ["And miraculously... | nobody died tonight.", "The village wakes... | and everyone is still alive."],
    ["और चमत्कार... | आज रात कोई नहीं मरा।", "गाँव जागा... | और सब ज़िंदा हैं।"],
    ["அதிசயமா... | இன்னிக்கு ராத்திரி யாரும் சாகல.", "ஊரு முழிச்சிடுச்சு... | எல்லாரும் உசுரோட இருக்காங்க."],
    ["ఆశ్చర్యంగా... | ఈ రాత్రి ఎవరూ చనిపోలేదు.", "ఊరు మేల్కొంది... | అందరూ బతికే ఉన్నారు."],
  ),
  day: v(
    ["The village gathers. | Someone among you is lying. || Discuss. | You have {time}."],
    ["गाँव इकट्ठा हुआ है। | आप में से कोई झूठ बोल रहा है। || चर्चा कीजिए। | आपके पास {time} हैं।"],
    ["ஊரே கூடியிருக்கு. | உங்கள்ல யாரோ ஒருத்தர் பொய் சொல்றாங்க. || பேசுங்க, விவாதிங்க. | உங்களுக்கு {time} இருக்கு."],
    ["ఊరంతా ఒకచోట చేరింది. | మీలో ఎవరో అబద్ధం చెప్తున్నారు. || చర్చించండి. | మీకు {time} ఉంది."],
  ),
  "time.seconds": v(["{n} seconds"], ["{n} सेकंड"], ["{n} செகண்ட்"], ["{n} సెకన్లు"]),
  "time.minute": v(["{n} minute"], ["{n} मिनट"], ["{n} நிமிஷம்"], ["{n} నిమిషం"]),
  "time.minutes": v(["{n} minutes"], ["{n} मिनट"], ["{n} நிமிஷம்"], ["{n} నిమిషాలు"]),
  "vote.trial": v(
    ["Time is up. || Who do you suspect? | Cast your first vote. | It only decides who must defend themselves."],
    ["समय पूरा हुआ। || आपको किस पर शक है? | अपना पहला वोट दीजिए। | इससे सिर्फ़ यह तय होगा कि किसे सफ़ाई देनी होगी।"],
    ["டைம் முடிஞ்சிடுச்சு. || யாரு மேல சந்தேகம்? | முதல் ஓட்டைப் போடுங்க. | இது யாரு தன்னை நிரூபிக்கணும்னு மட்டும்தான் முடிவு பண்ணும்."],
    ["టైమ్ అయిపోయింది. || ఎవరి మీద అనుమానం? | మొదటి ఓటు వేయండి. | ఇది ఎవరు తమను తాము సమర్థించుకోవాలో మాత్రమే నిర్ణయిస్తుంది."],
  ),
  "vote.quick": v(
    ["Time is up. || Point at the one you suspect... | and cast your vote."],
    ["समय पूरा हुआ। || जिस पर शक है, उसकी ओर इशारा कीजिए... | और अपना वोट दीजिए।"],
    ["டைம் முடிஞ்சிடுச்சு. || யாரை சந்தேகப்படறீங்களோ... | அவங்களுக்கு ஓட்டு போடுங்க."],
    ["టైమ్ అయిపోయింది. || ఎవరి మీద అనుమానమో వాళ్ళకి... | ఓటు వేయండి."],
  ),
  "tie.divided": v(["The village is divided. | Nobody is eliminated."], ["गाँव बँटा हुआ है। | किसी को बाहर नहीं किया जाएगा।"], ["ஊரே ரெண்டு பட்டு நிக்குது. | யாரும் வெளியேறல."], ["ఊరు రెండుగా చీలిపోయింది. | ఎవరూ బయటకు వెళ్ళరు."]),
  "tie.wait": v(["The village chooses to wait. | Nobody is eliminated."], ["गाँव ने इंतज़ार करना चुना। | किसी को बाहर नहीं किया जाएगा।"], ["ஊரு கொஞ்சம் பொறுத்துப் பாக்கலாம்னு முடிவு பண்ணிடுச்சு. | யாரும் வெளியேறல."], ["ఊరు కాస్త ఆగాలని అనుకుంది. | ఎవరూ బయటకు వెళ్ళరు."]),
  "votes.one": v(["{n} vote"], ["{n} वोट"], ["{n} ஓட்டு"], ["{n} ఓటు"]),
  "votes.many": v(["{n} votes"], ["{n} वोट"], ["{n} ஓட்டு"], ["{n} ఓట్లు"]),
  elim: v(
    ["{name}... | the village has spoken. || You are eliminated, with {votes}."],
    ["{name}... | गाँव ने फ़ैसला सुना दिया है। || आप {votes} के साथ बाहर हो गए।"],
    ["{name}... | ஊரே தீர்ப்பு சொல்லிடுச்சு. || {votes} வாங்கி நீங்க வெளியேறுறீங்க."],
    ["{name}... | ఊరు తీర్పు చెప్పేసింది. || {votes} తో మీరు బయటకు వెళ్తున్నారు."],
  ),
  "elim.role": v([" || They were {were}."], [" || वे {were} थे।"], [" || அவங்க ஒரு {were}."], [" || వాళ్ళు {were}."]),
  noaccuse: v(["The village cannot agree on anyone. | Nobody is accused."], ["गाँव किसी एक पर सहमत नहीं हो पाया। | इसलिए किसी पर आरोप नहीं।"], ["ஊருக்கு யார் மேலயும் ஒத்த முடிவு வரல. | அதனால யார் மேலயும் குற்றம் இல்ல."], ["ఊరికి ఎవరి మీదా ఏకాభిప్రాయం రాలేదు. | కాబట్టి ఎవరి మీదా ఆరోపణ లేదు."]),
  "defense.two": v(["{a}... | and {b}. || You stand accused."], ["{a}... | और {b}। || आप पर आरोप है।"], ["{a}... | அப்புறம் {b}. || உங்க மேல குற்றம் சொல்லப்பட்டிருக்கு."], ["{a}... | మరియు {b}. || మీ మీద ఆరోపణ ఉంది."]),
  "defense.one": v(["{a}... | you stand accused."], ["{a}... | आप पर आरोप है।"], ["{a}... | உங்க மேல குற்றம் சொல்லப்பட்டிருக்கு."], ["{a}... | మీ మీద ఆరోపణ ఉంది."]),
  "defense.start": v(["The first votes are in. || {intro} || {call}"], ["पहले वोट आ गए हैं। || {intro} || {call}"], ["முதல் ஓட்டு முடிஞ்சது. || {intro} || {call}"], ["మొదటి ఓట్లు వచ్చాయి. || {intro} || {call}"]),
  "defense.first": v(["{name}... | the floor is yours. | You have {time} to defend yourself."], ["{name}... | अब आपकी बारी है। | अपनी सफ़ाई देने के लिए आपके पास {time} हैं।"], ["{name}... | இப்போ உங்க டர்ன். | உங்களை நிரூபிக்க {time} இருக்கு."], ["{name}... | ఇప్పుడు మీ వంతు. | మిమ్మల్ని మీరు సమర్థించుకోవడానికి {time} ఉంది."]),
  "defense.next": v(["Now... | {name}. | Your turn. | You have {time} to defend yourself."], ["अब... | {name}। | आपकी बारी। | अपनी सफ़ाई देने के लिए आपके पास {time} हैं।"], ["அடுத்தது... | {name}. | உங்க டர்ன். | உங்களை நிரூபிக்க {time} இருக்கு."], ["ఇప్పుడు... | {name}. | మీ వంతు. | మిమ్మల్ని మీరు సమర్థించుకోవడానికి {time} ఉంది."]),
  final: v(["The defenses are done. || Now... | cast your final vote. | Who will be eliminated?"], ["सफ़ाई पूरी हुई। || अब... | अपना अंतिम वोट दीजिए। | किसे बाहर किया जाए?"], ["எல்லாரும் பேசி முடிச்சாச்சு. || இப்போ... | கடைசி ஓட்டைப் போடுங்க. | யாரை வெளியேத்தணும்?"], ["అందరూ మాట్లాడేశారు. || ఇప్పుడు... | చివరి ఓటు వేయండి. | ఎవరిని బయటకు పంపాలి?"]),
  "win.town": v(["The last Mafia is gone. || The Town wins!"], ["आख़िरी माफ़िया भी पकड़ा गया। || गाँव वालों की जीत हुई!"], ["கடைசி மாஃபியாவும் மாட்டிக்கிச்சு. || ஊர்க்காரங்க ஜெயிச்சுட்டாங்க!"], ["చివరి మాఫియా కూడా దొరికిపోయింది. || ఊరివాళ్ళు గెలిచారు!"]),
  "win.jester": v(["The Jester has fooled the whole village. || The Jester wins!"], ["विदूषक ने पूरे गाँव को बेवकूफ़ बना दिया। || विदूषक जीत गया!"], ["ஜோக்கர் ஊரையே ஏமாத்திட்டாரு. || ஜோக்கர் ஜெயிச்சுட்டாரு!"], ["జోకర్ ఊరంతటినీ బురిడీ కొట్టించాడు. || జోకర్ గెలిచాడు!"]),
  "win.mafia": v(["Darkness settles over the village for good. || The Mafia wins."], ["गाँव पर हमेशा के लिए अँधेरा छा गया। || माफ़िया जीत गया।"], ["ஊர் மேல இருட்டு நிரந்தரமா கவிஞ்சிடுச்சு. || மாஃபியா ஜெயிச்சுடுச்சு."], ["ఊరి మీద శాశ్వతంగా చీకటి కమ్మేసింది. || మాఫియా గెలిచింది."]),
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

/**
 * A rough guess at how long a line takes to say, in milliseconds (about 15 characters a second, plus its pauses).
 * The server uses it so the game never moves on while the narrator is still talking.
 */
export function estimateSpeechMs(text: string, lang: Lang = "en"): number {
  const perChar = lang === "en" ? 68 : 85; // Hindi and Tamil run longer per character
  const ms = segmentsOf(text).reduce((n, seg) => n + seg.say.length * perChar + seg.gap, 0);
  return Math.round(ms * 1.1 + 500);
}
