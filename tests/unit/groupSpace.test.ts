import { describe, expect, it } from "vitest";
import { parseAttendance, projectGroupMembers } from "@/lib/groupSpace";

describe("group space privacy", () => {
  const roster = [{ id: "me", name: "본인" }, { id: "other", name: "다른하객" }];
  it("defaults to masked names and never exposes IDs or private responses", () => {
    const result = projectGroupMembers(roster, [{ member_id: "other", attendance: "no", share_with_group: false }], "me");
    expect(result).toEqual([{ name: "다＊＊", attendance: null, shared: false }]);
    expect(JSON.stringify(result)).not.toContain("other");
  });
  it("only consent reveals name and attendance; withdrawal hides both", () => {
    expect(projectGroupMembers(roster, [{ member_id: "other", attendance: "yes", share_with_group: true }], "me"))
      .toEqual([{ name: "다른하객", attendance: "yes", shared: true }]);
    expect(projectGroupMembers(roster, [], "me")[0].shared).toBe(false);
  });
  it("never adds non-roster heart applicants or another group's responses", () => {
    expect(projectGroupMembers(roster, [{ member_id: "outsider", attendance: "yes", share_with_group: true }], "me"))
      .toEqual([{ name: "다＊＊", attendance: null, shared: false }]);
  });
  it("validates attendance strictly, including clearing", () => {
    for (const value of ["yes", "maybe", "no", null]) expect(parseAttendance(value)).toBe(value);
    for (const value of [undefined, "", true, {}, "attending"]) expect(parseAttendance(value)).toBeUndefined();
  });
});
