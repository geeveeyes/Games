import { useCallback, useEffect, useState, type ReactNode } from "react";
import { type Mode, type Role, type Settings, type Visibility, type VoteStyle, actsIn, isMafiaRole } from "../shared/game";
import { DAY_SECONDS, DEFENSE_SECONDS, LANGS, MAFIA_COUNTS, MODE_IDS, VISIBILITY_IDS, VOTE_SECONDS, VOTE_STYLE_IDS } from "../shared/options";
import type { ClientView, RoomSummary } from "../shared/room";
import { call, callRooms, loadSession, playerToken, saveName, saveSession, savedName, useRoom, type Session } from "./api";
import { keepAwake, plain, useNarrator } from "./narrator";
import { Admin } from "./Admin";
import { inviteUrl, readInvite, tvUrl } from "./invite";
import { QrCode, ShareBar, useInstall } from "./Invite";
import { FeedbackModal, type FeedbackContext } from "./Feedback";
import { RulesModal } from "./Rules";

type Act = (a: Record<string, unknown>) => Promise<boolean>;
type Player = ClientView["players"][number];

const ROLE_INFO: Record<Role, { title: string; tip: string; team: "Mafia" | "Town" | "Neutral" }> = {
  mafia: { title: "Mafia", tip: "Each night, agree with your partners on one person to eliminate. By day, blend in.", team: "Mafia" },
  doctor: { title: "Doctor", tip: "Each night, pick one person to protect. You may protect yourself.", team: "Town" },
  detective: { title: "Detective", tip: "Each night, learn whether one person is Mafia. Use it wisely.", team: "Town" },
  villager: { title: "Villager", tip: "No night power. Talk, reason, and vote out the Mafia.", team: "Town" },
  godfather: { title: "Godfather", tip: "You lead the Mafia. The Detective sees you as innocent. Pick a victim with your partners.", team: "Mafia" },
  jester: { title: "Jester", tip: "You win alone if the village votes you out. Be suspicious, but not too obviously.", team: "Neutral" },
  vigilante: { title: "Vigilante", tip: "You have one bullet for the whole game. Shoot at night, or hold your fire. Be sure.", team: "Town" },
};

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const leave = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);
  const room = useRoom(session, leave);
  const narrator = useNarrator(room.view);
  const [invite] = useState(() => readInvite(location.search));
  const [rules, setRules] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [admin, setAdmin] = useState(() => location.hash === "#admin");
  useEffect(() => {
    const h = () => setAdmin(location.hash === "#admin");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  useEffect(() => {
    if (session) keepAwake();
  }, [session]);

  const enter = (s: Session) => {
    saveSession(s);
    setSession(s);
    if (location.search) history.replaceState(null, "", location.pathname + location.hash); // the invite has done its job
  };

  const fbContext: FeedbackContext = room.view
    ? {
        room: room.view.code, phase: room.view.phase, round: room.view.round, mode: room.view.settings.mode,
        voteStyle: room.view.settings.voteStyle, visibility: room.view.settings.visibility,
        players: room.view.players.length, bots: room.view.players.filter((p) => p.bot).length,
        isHost: !!room.view.you?.isHost, narrator: narrator.on, screen: session?.mode === "watch" ? "tv" : "phone",
      }
    : { screen: "home" };

  if (admin) {
    return (
      <Shell>
        <Admin />
      </Shell>
    );
  }

  if (!session || !room.view) {
    return (
      <Shell onRules={() => setRules(true)} onFeedback={() => setFeedback(true)}>
        {session ? <p className="muted center">Connecting to room {session.code}…</p> : <Home onEnter={enter} onRules={() => setRules(true)} invite={invite} />}
        {rules && <RulesModal onClose={() => setRules(false)} />}
        {feedback && <FeedbackModal onClose={() => setFeedback(false)} context={fbContext} />}
        {session && room.error && (
          <div className="stack">
            <p className="error">{room.error}</p>
            <button className="btn ghost" onClick={leave}>Back</button>
          </div>
        )}
      </Shell>
    );
  }

  const v = room.view;
  const watch = session.mode === "watch";
  return (
    <Shell code={v.code} onRules={() => setRules(true)} onFeedback={() => setFeedback(true)} right={<NarratorControl n={narrator} />}>
      {room.offline && (
        <div className="offline" role="status">
          <span>Reconnecting… your game is safe and you will rejoin automatically.</span>
          <button className="chip" onClick={room.retry}>Try now</button>
        </div>
      )}
      {room.error && <p className="error" role="alert">{room.error}</p>}
      {watch ? (
        <Display v={v} now={room.now} narratorOn={narrator.on} enable={narrator.enable} />
      ) : (
        <PlayerScreen v={v} act={room.act} now={room.now} onLeave={leave} onFeedback={() => setFeedback(true)} />
      )}
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {feedback && <FeedbackModal onClose={() => setFeedback(false)} context={fbContext} />}
    </Shell>
  );
}

function Shell({ children, code, right, onRules, onFeedback }: { children: ReactNode; code?: string; right?: ReactNode; onRules?: () => void; onFeedback?: () => void }) {
  return (
    <div className="app">
      <header className="top">
        <span className="brand">Mafia God Mode</span>
        <span className="grow" />
        {right}
        {onRules && <button className="chip" onClick={onRules}>Rules</button>}
        {onFeedback && <button className="chip fb" onClick={onFeedback}>Feedback</button>}
        {code && <span className="chip code-chip" aria-label={`Room code ${code}`}>{code}</span>}
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

// ---------- Home ----------
/** A game that has started only lets its own players back in, by the same name. */
const joinHint = (e: string) => (/already started/.test(e) ? `${e} Were you playing? Enter the same name you used before to take your seat back.` : e);
const MODE_LABEL: Record<string, string> = { table: "TV or laptop", phones: "Phones only", remote: "Remote" };
function Home({ onEnter, onRules, invite }: { onEnter: (s: Session) => void; onRules: () => void; invite: { room?: string; tv?: string } }) {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(invite.room ?? "");
  const install = useInstall();
  const [invited, setInvited] = useState<{ name: string; host: string; players: number; started: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    await fn();
    setBusy(false);
  };
  const create = () =>
    run(async () => {
      saveName(name);
      const r = await call({ action: "create", token: playerToken(), name });
      r.ok ? onEnter({ code: r.code, mode: "player" }) : setErr(r.error);
    });
  const join = () =>
    run(async () => {
      saveName(name);
      const c = code.trim().toUpperCase();
      const r = await call({ action: "join", code: c, token: playerToken(), name });
      r.ok ? onEnter({ code: r.code, mode: "player" }) : setErr(joinHint(r.error));
    });
  const watch = (c = code.trim().toUpperCase()) =>
    run(async () => {
      const r = await call({ action: "watch", code: c });
      r.ok ? onEnter({ code: r.code, mode: "watch" }) : setErr(r.error);
    });
  const joinCode = (c: string) =>
    run(async () => {
      if (!name.trim()) return setErr("Enter your name first, then pick a room.");
      saveName(name);
      const r = await call({ action: "join", code: c, token: playerToken(), name });
      r.ok ? onEnter({ code: r.code, mode: "player" }) : setErr(joinHint(r.error));
    });

  // An invite link: show whose room it is, and a TV link goes straight to the shared screen.
  useEffect(() => {
    if (invite.tv) {
      void watch(invite.tv);
      return;
    }
    if (!invite.room) return;
    let live = true;
    call({ action: "watch", code: invite.room }).then((r) => {
      if (!live) return;
      if (!r.ok) return setErr(r.status === 404 ? "That room is not open any more. Ask for a new link." : r.error);
      const v = r.view;
      setInvited({ name: v.settings.roomName || "Game room", host: v.players.find((p) => p.id === v.hostId)?.name ?? "the host", players: v.players.length, started: v.phase !== "lobby" });
    });
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (!document.hidden) {
        const r = await callRooms();
        if (live) setRooms(r);
      }
      if (live) timer = setTimeout(load, 4000);
    };
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="stack gap-lg">
      {invite.room && invited && (
        <div className="invitecard">
          <span className="tag">You are invited</span>
          <b>{invited.name}</b>
          <span className="muted small">Host {invited.host} · {invited.players} {invited.players === 1 ? "player" : "players"} so far</span>
          {invited.started ? (
            <p className="muted small">This game has started. If you were playing, enter the same name to take your seat back.</p>
          ) : (
            <p className="muted small">Enter your name and tap Join game.</p>
          )}
        </div>
      )}
      <div className="stack">
        <h1>Everyone plays.<br />Nobody narrates.</h1>
        <p className="muted">The app deals roles, speaks the night script, and counts votes. Open this page on every phone.</p>
      </div>
      <label className="field">
        <span>Your name</span>
        <input id="name" value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} placeholder="e.g. Meena" />
      </label>
      <button className="btn" disabled={busy || !name.trim()} onClick={create}>Create a game</button>
      <div className="divider"><span>or join one</span></div>
      <section className="stack" aria-label="Open rooms">
        <h3>Open rooms</h3>
        {rooms === null && <p className="muted small">Looking for rooms…</p>}
        {rooms?.length === 0 && <p className="muted small">No open rooms right now. Create one, or enter a room code below.</p>}
        {rooms?.map((r) => (
          <div key={r.code} className="roomcard">
            <div className="roominfo">
              <b>{r.name}</b>
              <span className="muted small">{r.host} · {r.players}/{r.max} players · {MODE_LABEL[r.mode] ?? r.mode}</span>
            </div>
            <div className="roomact">
              <button className="btn" disabled={busy} onClick={() => joinCode(r.code)}>{r.visibility === "ask" ? "Ask to join" : "Join"}</button>
              {r.visibility === "open" && <button className="btn ghost" disabled={busy} onClick={() => watch(r.code)}>Watch</button>}
            </div>
          </div>
        ))}
      </section>
      <label className="field">
        <span>Room code</span>
        <input id="code" className="codeinput" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KXRT" />
      </label>
      <div className="row2">
        <button className="btn" disabled={busy || code.length !== 4 || !name.trim()} onClick={join}>Join game</button>
        <button className="btn ghost" disabled={busy || code.length !== 4} onClick={() => watch()}>Show on TV</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="linkbtn" onClick={onRules}>New to Mafia? Read the rules</button>
      {install.canInstall && <button className="btn ghost" onClick={install.install}>Install the app on this device</button>}
      {install.showIosHint && <p className="muted small center">On iPhone or iPad: tap Share, then Add to Home Screen.</p>}
    </div>
  );
}

// ---------- shared bits ----------
function Timer({ due, now, label }: { due: number | null; now: () => number; label?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  if (due === null) return null;
  const s = Math.max(0, Math.ceil((due - now()) / 1000));
  return (
    <div className="timer" aria-live="off">
      {label && <span className="tag">{label}</span>}
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </div>
  );
}

function Narration({ v }: { v: ClientView }) {
  const line = v.lines.at(-1);
  return line ? <p className="narration" aria-live="polite">{plain(line.text)}</p> : null;
}

function Pick({
  players, allowed, selected, onPick, badges, disabled,
}: {
  players: Player[];
  allowed: Set<string>;
  selected: string | null;
  onPick: (id: string) => void;
  badges?: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <div className="roster" role="listbox">
      {players.map((p) => {
        const can = allowed.has(p.id) && !disabled;
        return (
          <button
            key={p.id}
            role="option"
            aria-selected={selected === p.id}
            className={`prow ${selected === p.id ? "sel" : ""} ${!p.alive ? "dead" : ""}`}
            disabled={!can}
            onClick={() => onPick(p.id)}
          >
            <span className="av">{p.name[0]}</span>
            <span>{p.name}</span>
            {p.bot && <span className="rtag bot">bot</span>}
            {p.role && <span className="rtag">{ROLE_INFO[p.role].title}</span>}
            {badges?.[p.id] && <span className="rtag hot">{badges[p.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function RoleCard({ role, partners }: { role: Role; partners: string[] }) {
  const [show, setShow] = useState(false);
  const info = ROLE_INFO[role];
  return (
    <button
      className={`card ${show ? `revealed ${role}` : ""}`}
      onPointerDown={() => setShow(true)}
      onPointerUp={() => setShow(false)}
      onPointerLeave={() => setShow(false)}
      onPointerCancel={() => setShow(false)}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setShow((s) => !s)}
      aria-label={show ? `Your role: ${info.title}` : "Hold to see your role"}
    >
      {show ? (
        <>
          <span className="tag">You are</span>
          <span className="big">{info.title}</span>
          <span className="cardtip">{info.tip}</span>
          {partners.length > 0 && <span className="tag">Partner{partners.length > 1 ? "s" : ""}: {partners.join(", ")}</span>}
        </>
      ) : (
        <>
          <span className="big dim">?</span>
          <span className="tag">Press and hold to see your role</span>
        </>
      )}
    </button>
  );
}

/** Eliminated players may post in the ghost channel at any point after the game starts. */
const ghostCanTalk = (v: ClientView) => !!v.you && !v.you.alive && v.phase !== "lobby" && v.phase !== "reveal";

function TalkBox({ v, act }: { v: ClientView; act: Act }) {
  const [text, setText] = useState("");
  const alive = !!v.you?.alive || ghostCanTalk(v);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    await act({ action: "say", text: t });
  };
  const ghost = !!v.you && !v.you.alive && v.phase !== "over";
  return (
    <section className="stack talk" aria-label={ghost ? "Ghost chat" : "Table talk"}>
      <h3>{ghost ? "Ghost chat" : "Table talk"}</h3>
      {ghost && <p className="muted small">Only eliminated players see what is said here. You can still read the table talk.</p>}
      {v.talk.length === 0 && <p className="muted small">Nobody has spoken yet.</p>}
      <ul className="talklist">
        {v.talk.map((t) => (
          <li key={t.seq} className={t.id === v.you?.id ? "mine" : ""}>
            <b>{t.name}</b>{t.bot && <span className="rtag bot">bot</span>}{t.ghost && <span className="rtag">ghost</span>} {t.text}
          </li>
        ))}
      </ul>
      {alive && (
        <form className="talkform" onSubmit={send}>
          <input id="say" value={text} maxLength={140} placeholder="Say something to the table" onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <button className="btn" type="submit" disabled={!text.trim()}>Say</button>
        </form>
      )}
    </section>
  );
}

function HostSkip({ v, act, label }: { v: ClientView; act: Act; label: string }) {
  return v.you?.isHost ? <button className="btn ghost" onClick={() => act({ action: "skip", at: v.skipToken })}>{label}</button> : null;
}

// ---------- Player screens ----------
function PlayerScreen({ v, act, now, onLeave, onFeedback }: { v: ClientView; act: Act; now: () => number; onLeave: () => void; onFeedback: () => void }) {
  const me = v.you;
  if (!me) {
    const hostName = v.players.find((p) => p.id === v.hostId)?.name ?? "the host";
    const msg =
      v.joinStatus === "pending" ? `Waiting for ${hostName} to let you in…`
      : v.joinStatus === "declined" ? `${hostName} did not accept your request.`
      : v.joinStatus === "blocked" ? "You were removed from this room."
      : "You are not in this room.";
    return (
      <div className="stack gap-lg center">
        <h2>{v.settings.roomName || "Game room"}</h2>
        <p className={v.joinStatus === "pending" ? "narration" : "muted"} aria-live="polite">{msg}</p>
        {v.joinStatus === "declined" && <button className="btn" onClick={() => act({ action: "join", name: savedName() })}>Ask again</button>}
        <button className="btn ghost" onClick={async () => { await act({ action: "leave" }); onLeave(); }}>
          {v.joinStatus === "pending" ? "Cancel request" : "Back"}
        </button>
      </div>
    );
  }
  const alive = v.players.filter((p) => p.alive);
  const others = alive.filter((p) => p.id !== me.id);
  const spectator = !me.alive && v.phase !== "lobby" && v.phase !== "over";
  const partners = isMafiaRole(me.role) ? v.players.filter((p) => isMafiaRole(p.role) && p.id !== me.id).map((p) => p.name) : [];

  const banner = spectator ? <p className="banner">You are out of the game. You can keep watching.</p> : null;

  switch (v.phase) {
    case "lobby":
      return <Lobby v={v} act={act} onLeave={onLeave} />;

    case "reveal": {
      const waiting = v.players.filter((p) => !p.seenRole && p.connected).length;
      return (
        <div className="stack gap-lg">
          <Narration v={v} />
          {me.role && <RoleCard role={me.role} partners={partners} />}
          {me.role === "mafia" && null}
          {!v.players.find((p) => p.id === me.id)?.seenRole ? (
            <button className="btn" onClick={() => act({ action: "ack" })}>I have seen my role</button>
          ) : (
            <p className="muted center">Waiting for {waiting} more player{waiting === 1 ? "" : "s"}…</p>
          )}
          <HostSkip v={v} act={act} label="Start the night now" />
        </div>
      );
    }

    case "night": {
      const step = v.night.step;
      const isMyTurn = me.alive && actsIn(me.role, step) && v.night.yourTargets.length > 0;
      const classic = v.settings.mode !== "remote";
      if (isMyTurn && step) {
        const allowed = new Set(v.night.yourTargets);
        const list = step === "mafia" ? others.filter((p) => !isMafiaRole(p.role)) : step === "doctor" ? alive : others;
        const lastNote = me.notes.at(-1);
        const targetName = (id: string) => v.players.find((p) => p.id === id)?.name ?? "?";
        const badges: Record<string, string> = {};
        for (const [mid, t] of Object.entries(v.night.mafiaPicks)) if (mid !== me.id) badges[t] = `${targetName(mid)} picked`;
        const title = { mafia: "Choose who to eliminate", doctor: "Choose who to save", detective: "Choose who to investigate", vigilante: "Shoot someone, or hold your fire" }[step];
        return (
          <div className="stack gap-lg night">
            <Narration v={v} />
            <div className="moon" aria-hidden />
            <h2>{title}</h2>
            {step === "detective" && v.night.yourPick && lastNote ? (
              <div className={`card revealed ${lastNote.isMafia ? "mafia" : "detective"}`}>
                <span className="tag">{targetName(lastNote.targetId)} is</span>
                <span className="big">{lastNote.isMafia ? "Mafia" : "Innocent"}</span>
                <span className="tag">Keep it to yourself</span>
              </div>
            ) : (
              <>
                {step === "mafia" && partners.length > 0 && <p className="muted">Partner{partners.length > 1 ? "s" : ""}: {partners.join(", ")}. Everyone must pick the same person.</p>}
                {step === "vigilante" && <p className="muted">You have one bullet for the whole game. Once it is spent, it is gone.</p>}
                <Pick players={list} allowed={allowed} selected={v.night.yourPick === "skip" ? null : v.night.yourPick} onPick={(id) => act({ action: "night", target: id })} badges={badges} />
                {step === "vigilante" && (
                  <button className={`btn ${v.night.yourPick === "skip" ? "" : "ghost"}`} onClick={() => act({ action: "night", target: "skip" })}>Hold fire</button>
                )}
                {v.night.yourPick && <p className="muted center">{v.night.yourPick === "skip" ? "You are holding fire. " : "Locked in. "}{step === "mafia" ? "Waiting for your partners to match." : "Waiting for the night to continue."}</p>}
              </>
            )}
          </div>
        );
      }
      return (
        <div className="stack gap-lg center night sleep">
          <Narration v={v} />
          <div className="moon" aria-hidden />
          <h2>{classic ? "Keep your eyes closed" : "Night"}</h2>
          <p className="muted">{me.alive ? (classic ? "Do not peek. The narrator will tell you when it is morning." : "Night roles are acting. Wait for morning.") : "You are out of the game."}</p>
          {!me.alive && <div className="stack left"><TalkBox v={v} act={act} /></div>}
        </div>
      );
    }

    case "dawn":
    case "result":
      return (
        <div className="stack gap-lg center">
          {banner}
          <div className={v.phase === "dawn" ? "sun" : "gavel"} aria-hidden />
          <Narration v={v} />
          <Timer due={v.due} now={now} label="Next" />
          {spectator && <div className="stack left"><TalkBox v={v} act={act} /></div>}
          <HostSkip v={v} act={act} label="Continue" />
        </div>
      );

    case "day":
      return (
        <div className="stack gap-lg">
          {banner}
          <div className="sun" aria-hidden />
          <Narration v={v} />
          <Timer due={v.due} now={now} label="Voting opens in" />
          <TalkBox v={v} act={act} />
          <Roster players={v.players} />
          <HostSkip v={v} act={act} label="Start the vote now" />
        </div>
      );

    case "defense": {
      const speaker = v.players.find((p) => p.id === v.defendants[v.defenseIdx]);
      const accused = v.defendants.map((id) => v.players.find((p) => p.id === id)?.name).filter(Boolean).join(" and ");
      const mineTurn = speaker?.id === me.id;
      return (
        <div className="stack gap-lg center">
          {banner}
          <span className="tag">The accused: {accused}</span>
          <div className="defender">{speaker?.name}</div>
          <p className="muted">{mineTurn ? "Your turn. Convince the village you are innocent." : "is defending themselves. Listen closely."}</p>
          <Timer due={v.due} now={now} label="Time to speak" />
          <TalkBox v={v} act={act} />
          <HostSkip v={v} act={act} label={v.defenseIdx + 1 < v.defendants.length ? "Next speaker" : "Go to the final vote"} />
        </div>
      );
    }

    case "vote": {
      const mine = v.vote.yourVote;
      const final = v.vote.stage === "final";
      const trial = v.settings.voteStyle === "trial";
      const pool = final && v.defendants.length ? others.filter((p) => v.defendants.includes(p.id)) : others;
      const badges: Record<string, string> = {};
      for (const [id, n] of Object.entries(v.vote.counts)) if (id !== "skip") badges[id] = `${n} vote${n === 1 ? "" : "s"}`;
      return (
        <div className="stack gap-lg">
          {banner}
          <Narration v={v} />
          <span className="tag center">{trial ? (final ? "Final vote" : "First vote") : "Vote"}</span>
          <Timer due={v.due} now={now} label="Vote ends" />
          <Pick players={pool} allowed={new Set(pool.map((p) => p.id))} selected={mine} onPick={(id) => act({ action: "vote", target: id })} badges={badges} disabled={!me.alive} />
          {me.alive && (
            <button className={`btn ${mine === "skip" ? "" : "ghost"}`} onClick={() => act({ action: "vote", target: "skip" })}>
              {final && trial ? "Spare them" : "Skip vote"}{v.vote.counts.skip ? ` (${v.vote.counts.skip})` : ""}
            </button>
          )}
          <p className="muted center">{v.vote.voted} of {v.vote.eligible} have voted</p>
          {!me.alive && Object.keys(v.vote.byWho).length > 0 && (
            <div className="stack left"><h3>Votes so far</h3>
              <ul className="talklist">{Object.entries(v.vote.byWho).map(([from, to]) => (
                <li key={from}><b>{v.players.find((p) => p.id === from)?.name}</b> → {to === "skip" ? "skip" : v.players.find((p) => p.id === to)?.name}</li>
              ))}</ul>
            </div>
          )}
          <TalkBox v={v} act={act} />
          <HostSkip v={v} act={act} label="Close the vote now" />
        </div>
      );
    }

    case "over":
      return (
        <div className="stack gap-lg">
          <div className={`card revealed ${v.winner === "town" ? "detective" : v.winner === "jester" ? "jester" : "mafia"}`}>
            <span className="tag">Winners</span>
            <span className="big">{v.winner === "town" ? "Town" : v.winner === "jester" ? "Jester" : "Mafia"}</span>
            <span className="tag">{v.lines.at(-1)?.text}</span>
          </div>
          <Roster players={v.players} showRoles />
          {me.isHost ? (
            <button className="btn" onClick={() => act({ action: "rematch" })}>Play again</button>
          ) : (
            <p className="muted center">Waiting for the host to start another game.</p>
          )}
          <button className="btn ghost" onClick={onFeedback}>How was the game? Give feedback</button>
          <button className="btn ghost" onClick={onLeave}>Leave room</button>
        </div>
      );
  }
}

function Roster({ players, showRoles, onRemove, hostId, onHost, you }: { players: Player[]; showRoles?: boolean; onRemove?: (id: string) => void; hostId?: string | null; onHost?: (id: string) => void; you?: string }) {
  return (
    <div className="roster">
      {players.map((p) => (
        <div key={p.id} className={`prow static ${!p.alive ? "dead" : ""}`}>
          <span className="av">{p.name[0]}</span>
          <span>{p.name}</span>
          {!p.bot && <span className={`dot ${p.connected ? "on" : "off"}`} title={p.connected ? "Connected" : "Away"} aria-label={p.connected ? "connected" : "away"} />}
          {p.bot && <span className="rtag bot">bot</span>}
          {p.id === hostId && <span className="rtag">host</span>}
          {onHost && !p.bot && p.id !== hostId && p.id !== you && <button className="chip mk" onClick={() => onHost(p.id)}>Make host</button>}
          {onRemove && p.id !== hostId && <button className="x" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}>×</button>}
          {(showRoles || p.role) && p.role && <span className="rtag">{ROLE_INFO[p.role].title}</span>}
          {!p.alive && <span className="rtag">out</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- Lobby ----------
const MODE_TEXT: Record<Mode, { title: string; text: string }> = {
  table: { title: "In person with a TV or laptop", text: "Narration on a shared screen. Eyes closed at night." },
  phones: { title: "In person, phones only", text: "The host's phone is the narrator. Eyes closed at night." },
  remote: { title: "Remote on a video call", text: "No eyes-closed step. Phones act privately." },
};
const MODES = MODE_IDS.map((id) => ({ id, ...MODE_TEXT[id] }));
const VOTE_TEXT: Record<VoteStyle, { title: string; text: string }> = {
  trial: { title: "Trial vote", text: "First vote, defenses from the top accused, then a final vote." },
  quick: { title: "Quick vote", text: "One vote and the top player is eliminated." },
};
const VISIBILITY_TEXT: Record<Visibility, { title: string; text: string }> = {
  private: { title: "Private", text: "Not listed. People need the room code." },
  open: { title: "Open", text: "Listed on the home screen. Anyone can join with one tap." },
  ask: { title: "Ask to join", text: "Listed, but you approve each person." },
};

function Lobby({ v, act, onLeave }: { v: ClientView; act: Act; onLeave: () => void }) {
  const host = !!v.you?.isHost;
  const s = v.settings;
  const set = (patch: Partial<Settings>) => act({ action: "settings", patch });
  const [roomName, setRoomName] = useState(s.roomName);
  useEffect(() => setRoomName(s.roomName), [s.roomName]);
  const n = v.players.length;
  const enough = n >= v.minPlayers;
  const sg = v.suggested;
  const toggle = (key: keyof Settings, label: string, hint?: string) => (
    <label className="check">
      <input type="checkbox" checked={Boolean(s[key])} disabled={!host} onChange={(e) => set({ [key]: e.target.checked })} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
  return (
    <div className="stack gap-lg">
      <div className="stack">
        <span className="tag">Room code</span>
        <div className="bigcode">{v.code}</div>
        <p className="muted">Friends can scan the code below, open the link, or enter the room code on the home screen.</p>
      </div>
      <section className="stack invite" aria-label="Invite people">
        <QrCode url={inviteUrl(location.origin, v.code)} />
        <ShareBar url={inviteUrl(location.origin, v.code)} title={v.settings.roomName || "Mafia God Mode"} />
        <details className="tvlink">
          <summary>Show the game on a TV</summary>
          <p className="muted small">Open this link on the TV or laptop. It shows the narration, timer and who is alive.</p>
          <input className="linkfield" readOnly value={tvUrl(location.origin, v.code)} onFocus={(e) => e.currentTarget.select()} aria-label="TV link" />
        </details>
      </section>
      <section className="stack">
        <h3>Players ({n})</h3>
        {host && v.pending.length > 0 && (
          <div className="stack requests" aria-label="Join requests">
            <h3>Wants to join</h3>
            {v.pending.map((p) => (
              <div key={p.id} className="prow static">
                <span className="av">{p.name[0]}</span>
                <span>{p.name}</span>
                <span className="reqact">
                  <button className="chip on" onClick={() => act({ action: "admit", target: p.id })}>Let in</button>
                  <button className="chip" onClick={() => act({ action: "decline", target: p.id })}>Decline</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <Roster
          players={v.players.map((p) => ({ ...p, role: null }))}
          onRemove={host ? (id) => act({ action: v.players.find((p) => p.id === id)?.bot ? "removeBot" : "kick", target: id }) : undefined}
          hostId={v.hostId}
          you={v.you?.id}
          onHost={host ? (id) => act({ action: "makeHost", target: id }) : undefined}
        />
        {host && (
          <div className="row2">
            <button className="btn ghost" onClick={() => act({ action: "addBot" })}>Add a bot</button>
            <button className="btn ghost" onClick={() => act({ action: "addBot", count: Math.max(1, 6 - n) })} disabled={n >= 6}>Fill to 6 players</button>
          </div>
        )}
        {!enough && <p className="muted">Need at least {v.minPlayers} players. Add bots to fill empty seats.</p>}
      </section>
      <section className="stack">
        <h3>Who can join</h3>
        <div className="stack">
          {VISIBILITY_IDS.map((id) => ({ id, ...VISIBILITY_TEXT[id] })).map(({ id, title, text }) => (
            <label key={id} className={`opt ${s.visibility === id ? "sel" : ""}`}>
              <input type="radio" name="vis" checked={s.visibility === id} disabled={!host} onChange={() => set({ visibility: id })} />
              <span><b>{title}</b><small>{text}</small></span>
            </label>
          ))}
        </div>
        <label className="field"><span>Room name</span>
          <input id="roomname" value={roomName} maxLength={30} disabled={!host} onChange={(e) => setRoomName(e.target.value)} onBlur={() => roomName !== s.roomName && set({ roomName })} placeholder="e.g. Family night" />
        </label>
        <h3>Game setup {host ? "" : "(host controls)"}</h3>
        <div className="stack">
          {MODES.map((m) => (
            <label key={m.id} className={`opt ${s.mode === m.id ? "sel" : ""}`}>
              <input type="radio" name="mode" checked={s.mode === m.id} disabled={!host} onChange={() => set({ mode: m.id })} />
              <span><b>{m.title}</b><small>{m.text}</small></span>
            </label>
          ))}
        </div>
        <div className="mix">
          <span>With {Math.max(n, v.minPlayers)} players:</span>
          {([["Mafia", sg.mafia], ["Godfather", sg.godfather], ["Doctor", sg.doctor], ["Detective", sg.detective], ["Vigilante", sg.vigilante], ["Jester", sg.jester], ["Villager", sg.villager]] as [string, number][])
            .filter(([, k]) => k > 0)
            .map(([name, k]) => <b key={name}>{k} {name}{name === "Villager" && k !== 1 ? "s" : ""}</b>)}
        </div>
        <div className="stack">
          {VOTE_STYLE_IDS.map((id) => ({ id, ...VOTE_TEXT[id] })).map(({ id, title, text }) => (
            <label key={id} className={`opt ${s.voteStyle === id ? "sel" : ""}`}>
              <input type="radio" name="vstyle" checked={s.voteStyle === id} disabled={!host} onChange={() => set({ voteStyle: id })} />
              <span><b>{title}</b><small>{text}</small></span>
            </label>
          ))}
        </div>
        <h3>Roles in this game</h3>
        {toggle("useDoctor", "Doctor", "Saves one person each night")}
        {toggle("useDetective", "Detective", "Learns if someone is Mafia")}
        {toggle("useGodfather", "Godfather", "A Mafia boss who looks innocent to the Detective (needs 2 or more Mafia)")}
        {toggle("useVigilante", "Vigilante", "A town member with one bullet for the whole game (8 or more players works best)")}
        {toggle("useJester", "Jester", "Wins alone if the village votes them out (8 or more players works best)")}
        <h3>Rules</h3>
        {toggle("doctorSelfSave", "Doctor can save themselves")}
        {toggle("doctorRepeatSave", "Doctor can save the same person two nights in a row")}
        {toggle("revealRoleOnDeath", "Reveal a player's role when they die")}
        {toggle("deadSeeRoles", "Dead players can see every role")}
        <div className="row2">
          <label className="field"><span>Mafia count</span>
            <select id="mafia" value={s.mafiaCount ?? "auto"} disabled={!host} onChange={(e) => set({ mafiaCount: e.target.value === "auto" ? null : Number(e.target.value) })}>
              <option value="auto">Automatic</option>
              {MAFIA_COUNTS.filter((k): k is number => k !== null).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="field"><span>Discussion</span>
            <select id="day" value={s.dayTimerSec} disabled={!host} onChange={(e) => set({ dayTimerSec: Number(e.target.value) })}>
              {DAY_SECONDS.map((k) => <option key={k} value={k}>{k / 60} min</option>)}
            </select>
          </label>
          {s.voteStyle === "trial" && (
            <label className="field"><span>Defense</span>
              <select id="defense" value={s.defenseSec} disabled={!host} onChange={(e) => set({ defenseSec: Number(e.target.value) })}>
                {DEFENSE_SECONDS.map((k) => <option key={k} value={k}>{k} sec</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Narrator language</span>
            <select id="lang" value={s.language} disabled={!host} onChange={(e) => set({ language: e.target.value as Settings["language"] })}>
              {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Voting</span>
            <select id="vote" value={s.voteTimerSec} disabled={!host} onChange={(e) => set({ voteTimerSec: Number(e.target.value) })}>
              {VOTE_SECONDS.map((k) => <option key={k} value={k}>{k} sec</option>)}
            </select>
          </label>
        </div>
      </section>
      {host ? (
        <button className="btn" disabled={!enough} onClick={() => act({ action: "start" })}>Start game</button>
      ) : (
        <p className="muted center">Waiting for the host to start…</p>
      )}
      <button className="btn ghost" onClick={async () => { await act({ action: "leave" }); onLeave(); }}>Leave room</button>
    </div>
  );
}

// ---------- Table / TV screen ----------
function Display({ v, now, narratorOn, enable }: { v: ClientView; now: () => number; narratorOn: boolean; enable: () => void }) {
  const line = plain(v.lines.at(-1)?.text ?? "Waiting for players…");
  const label: Record<string, string> = { lobby: "Lobby", reveal: "Roles", night: "Night", dawn: "Dawn", day: "Day", vote: "Vote", defense: "Defense", result: "Result", over: "Game over" };
  const timed = ["day", "vote", "defense"].includes(v.phase);
  return (
    <div className={`tv-screen ${v.phase}`}>
      <div className="tv-main">
        <span className="tag">Round {v.round || "–"} · {label[v.phase]} · {v.players.filter((p) => p.alive).length} alive</span>
        <p className="tv-say" aria-live="polite">{line}</p>
        {timed && <Timer due={v.due} now={now} />}
        {v.phase === "lobby" && (
          <div className="tvjoin">
            <QrCode url={inviteUrl(location.origin, v.code)} size={200} label="Scan to join" />
            <p className="muted">Scan to join, or open <b className="mono">{location.host}</b> and enter <b className="mono">{v.code}</b>.</p>
          </div>
        )}
        {v.talk.length > 0 && ["day", "defense", "vote"].includes(v.phase) && (
          <ul className="talklist tv-talk">
            {v.talk.slice(-4).map((t) => <li key={t.seq}><b>{t.name}</b> {t.text}</li>)}
          </ul>
        )}
        {v.phase === "over" && <p className="tv-say win">{v.winner === "town" ? "Town wins" : v.winner === "jester" ? "Jester wins" : "Mafia wins"}</p>}
        {!narratorOn && <button className="btn" onClick={enable}>Turn on the narrator and music</button>}
      </div>
      <div className="seats">
        {v.players.map((p) => (
          <div key={p.id} className={`seat ${!p.alive ? "dead" : ""}`}>
            <span>{p.name}</span>
            {p.role && <small>{ROLE_INFO[p.role].title}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Narrator ----------
function NarratorControl({ n }: { n: ReturnType<typeof useNarrator> }) {
  if (!n.supported) return null;
  return (
    <button className={`chip ${n.on ? "on" : ""}`} aria-pressed={n.on} onClick={() => (n.on ? n.disable() : n.enable())}>
      {n.on ? "Narrator on" : "Narrator off"}
    </button>
  );
}
