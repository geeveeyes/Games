// Every choice the lobby offers. The UI renders from these lists and the tests try every value,
// so a control can never offer something the engine rejects.
import type { Mode, Visibility, VoteStyle } from "./game";

export const MODE_IDS: Mode[] = ["table", "phones", "remote"];
export const VOTE_STYLE_IDS: VoteStyle[] = ["trial", "quick"];
export const VISIBILITY_IDS: Visibility[] = ["private", "open", "ask"];
export const MAFIA_COUNTS: (number | null)[] = [null, 1, 2, 3, 4, 5];
export const DAY_SECONDS = [60, 120, 180, 300, 600];
export const VOTE_SECONDS = [30, 60, 90, 120];
export const DEFENSE_SECONDS = [20, 30, 45, 60];
export const TOGGLE_KEYS = ["useDoctor", "useDetective", "doctorSelfSave", "doctorRepeatSave", "revealRoleOnDeath", "deadSeeRoles"] as const;
