// Invite links: /?room=ABCD opens the join screen for that room, /?tv=ABCD opens the shared TV screen for it.
const CODE = /^[A-Z]{4}$/;

export const inviteUrl = (origin: string, code: string) => `${origin}/?room=${code}`;
export const tvUrl = (origin: string, code: string) => `${origin}/?tv=${code}`;

export function readInvite(search: string): { room?: string; tv?: string } {
  const q = new URLSearchParams(search);
  const clean = (v: string | null) => {
    const c = (v ?? "").trim().toUpperCase();
    return CODE.test(c) ? c : undefined;
  };
  return { room: clean(q.get("room")), tv: clean(q.get("tv")) };
}
