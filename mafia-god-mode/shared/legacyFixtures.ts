// Room documents as OLDER deploys saved them. Used by the compatibility tests and the stale-room browser test.
export const V1_SETTINGS = {
  mode: "table", doctorSelfSave: true, doctorRepeatSave: true, useDoctor: true, useDetective: true,
  mafiaCount: null, revealRoleOnDeath: false, deadSeeRoles: false, dayTimerSec: 180, voteTimerSec: 60,
};
export const V2_SETTINGS = { ...V1_SETTINGS, voteStyle: "trial", defenseSec: 30 };
export const V3_SETTINGS = { ...V2_SETTINGS, visibility: "private", roomName: "Old room" };

export const NEWER_TOP_LEVEL = ["talk", "talkSeq", "pending", "declined", "blocked", "voteStage", "defendants", "defenseIdx"];

/** A lobby exactly as an older deploy stored it: only the fields that existed then. */
export function oldLobby(settings: Record<string, unknown>, withNewerFields: boolean) {
  const player = (id: string, name: string) => ({ id, name, role: null, alive: true, connected: true, seenRole: false });
  const game: Record<string, unknown> = {
    phase: "lobby", round: 0, settings, players: [player("host", "Venkat"), player("g1", "Meena")], hostId: "host",
    winner: null, lines: [], notes: {}, steps: [], stepIdx: 0, mafiaPicks: {}, doctorPick: null, detectivePick: null,
    lastSaved: null, votes: {}, lastResult: null, lastNightDeathId: null, seq: 0,
  };
  if (withNewerFields) Object.assign(game, { talk: [], talkSeq: 0, pending: [], declined: [], blocked: [], voteStage: "final", defendants: [], defenseIdx: 0 });
  return game;
}

