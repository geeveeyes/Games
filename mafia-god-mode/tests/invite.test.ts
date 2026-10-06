import { describe, expect, it } from "vitest";
import { inviteUrl, readInvite, tvUrl } from "../src/invite";

describe("invite links", () => {
  it("builds and reads them back", () => {
    expect(inviteUrl("https://x.app", "KXRT")).toBe("https://x.app/?room=KXRT");
    expect(tvUrl("https://x.app", "KXRT")).toBe("https://x.app/?tv=KXRT");
    expect(readInvite("?room=KXRT")).toEqual({ room: "KXRT", tv: undefined });
    expect(readInvite("?tv=kxrt")).toEqual({ room: undefined, tv: "KXRT" });
  });
  it("ignores anything that is not a 4-letter code", () => {
    for (const bad of ["?room=", "?room=ABC", "?room=ABCDE", "?room=12AB", "?room=<script>", "?room=AB%20D", ""]) {
      expect(readInvite(bad), bad).toEqual({ room: undefined, tv: undefined });
    }
  });
});
