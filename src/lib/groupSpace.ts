/** Shared types and privacy projection. Never serialize raw roster/response rows. */
export type Attendance = "yes" | "maybe" | "no";
export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  yes: "참석할게요", maybe: "아직 모르겠어요", no: "참석이 어려워요",
};
export interface AttendanceRow {
  member_id: string;
  attendance: Attendance | null;
  share_with_group: boolean;
}
export interface GroupSpace {
  groupName: string;
  rosterCount: number;
  sharedAttendingCount: number;
  me: { name: string; attendance: Attendance | null; shareWithGroup: boolean };
  members: { name: string; attendance: Attendance | null; shared: boolean }[];
  schedules: { date: string; time_slot: string }[];
}
export function parseAttendance(value: unknown): Attendance | null | undefined {
  return value === null || value === "yes" || value === "maybe" || value === "no"
    ? value : undefined;
}
export function projectGroupMembers(
  roster: { id: string; name: string }[], responses: AttendanceRow[], myId: string,
) {
  const byId = new Map(responses.map((r) => [r.member_id, r]));
  return roster.filter((m) => m.id !== myId).map((m) => {
    const r = byId.get(m.id);
    const shared = r?.share_with_group === true && r.attendance !== null;
    return {
      name: shared ? m.name : `${Array.from(m.name.trim())[0] ?? ""}＊＊`,
      attendance: shared ? r.attendance : null,
      shared,
    };
  });
}
