import { useEffect, useRef } from "react";

export function RulesModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Run once. `onClose` changes identity on every refresh of the room, so it must not be a dependency,
  // or focus would be pulled out of the text box (closing a phone's keyboard) each time the game updates.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="rules-title">How to play</h2>
          <button className="chip" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body stack gap-lg">
          <section className="stack">
            <h3>The goal</h3>
            <p>A few players secretly belong to the <b>Mafia</b>. Everyone else is the <b>Town</b>. The Town wins by voting out every Mafia member. The Mafia wins when they equal or outnumber the Town.</p>
          </section>

          <section className="stack">
            <h3>The roles</h3>
            <ul className="rules-list">
              <li><b>Mafia.</b> Know each other. Each night they agree on one person to kill. By day they pretend to be innocent.</li>
              <li><b>Doctor.</b> Each night saves one person from the Mafia. The Doctor may be allowed to save themselves, and the same person two nights in a row (the host chooses). Nobody learns who was saved.</li>
              <li><b>Detective.</b> Each night learns whether one person is Mafia. Use it without giving yourself away.</li>
              <li><b>Villager.</b> No power. Talk, watch, and vote.</li>
            </ul>
          </section>

          <section className="stack">
            <h3>Each round</h3>
            <ol className="rules-list">
              <li><b>Night.</b> Everyone closes their eyes. The narrator wakes the Mafia, then the Doctor, then the Detective, one at a time. Each acts on their own phone. If a role has died, the narrator still waits, so nobody can tell.</li>
              <li><b>Dawn.</b> Everyone wakes. The narrator says who was killed, or that nobody died.</li>
              <li><b>Discussion.</b> Everyone talks, accuses, and defends. You can lie. The Town needs to find the Mafia, and the Mafia needs to blend in.</li>
              <li><b>Voting.</b> The village votes someone out. See the two styles below.</li>
              <li><b>Check.</b> If one side has won, the game ends and all roles are revealed. Otherwise the next night begins.</li>
            </ol>
          </section>

          <section className="stack">
            <h3>Voting styles</h3>
            <ul className="rules-list">
              <li><b>Trial (recommended).</b> A first vote shows who people suspect. The one or two players with the most votes are accused and each gets a timed speech to defend themselves. Then a final vote decides. The accused is eliminated only if more people vote to eliminate than to skip.</li>
              <li><b>Quick vote.</b> One vote. The player with the most votes is eliminated.</li>
            </ul>
            <p className="muted">In both styles a tie, or a lead for “skip”, means nobody is eliminated. You cannot vote for yourself.</p>
          </section>

          <section className="stack">
            <h3>Joining a game</h3>
            <p>Enter a room code, or pick a room from the <b>Open rooms</b> list on the home screen. The host chooses who can join: <b>Private</b> (code only, not listed), <b>Open</b> (listed, one tap to join), or <b>Ask to join</b> (listed, the host approves each person). The host can also remove anyone from the lobby. Rooms leave the list once the game starts.</p>
          </section>

          <section className="stack">
            <h3>Playing with bots</h3>
            <p>If you are short on players, the host can add bots in the lobby. Bots take real roles, act at night, talk at the table and vote like anyone else, and they are always labelled “bot”. Mention a bot by name in the table-talk box and it will answer.</p>
          </section>

          <section className="stack">
            <h3>When you are out</h3>
            <p>You can still watch, but you must stay silent and not hint at what you know. Roles stay hidden until the game ends, unless the host turned on reveals.</p>
          </section>

          <section className="stack">
            <h3>Fair play</h3>
            <ul className="rules-list">
              <li>Keep your eyes closed at night until the narrator says otherwise.</li>
              <li>Never show your phone screen. Say what you like, but you cannot prove your role.</li>
              <li>The host can change timers and optional rules in the lobby before the game starts.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
