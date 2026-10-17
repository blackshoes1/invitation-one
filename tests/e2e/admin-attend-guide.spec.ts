import { test, expect } from "@playwright/test";
import type { GroupMemberRow } from "../../src/lib/supabase";

for (const scope of ["group", "solo"] as const) {
  for (const existingDecline of [false, true]) {
    test(`${scope}: ${existingDecline ? "declined RSVP becomes attending" : "new attendee is registered"} in the guide list without sending SMS`, async ({ page }) => {
      const member: GroupMemberRow = {
        id: "m1", group_id: scope === "group" ? "g1" : null,
        name: "안내하객", phone: "010-1111-2222", created_at: "2026-09-01",
        attendance: existingDecline ? "no" : null,
        rsvp_id: existingDecline ? "r1" : null,
        rsvp: existingDecline ? { id: "r1", attending: false, side: "bride", companion_count: 1, companion_names: ["기존동반하객"] } : null,
      };
      const attendPath = scope === "group"
        ? "/api/admin/groups/g1/members/m1/attend"
        : "/api/admin/invitees/m1/attend";
      const attendanceRequests: { method: string; body: Record<string, unknown> }[] = [];
      const phoneRequests: Record<string, unknown>[] = [];
      const guideActions: Record<string, unknown>[] = [];
      const guideUrl = "https://example.invalid/guest-guide?t=personal-link";
      const recipient = () => ({
        id: member.rsvp_id, name: member.name, side: member.rsvp?.side,
        phoneMasked: `010-****-${member.phone?.slice(-4)}`, canSms: true,
        openedAt: null, confirmedAt: null, smsStatus: null, smsSentAt: null, smsAttemptedAt: null,
      });

      await page.route("**/api/admin/**", async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === attendPath) {
          const body = request.postDataJSON();
          attendanceRequests.push({ method: request.method(), body });
          member.rsvp_id = "r1";
          member.rsvp = { id: "r1", attending: true, side: body.side, companion_count: body.companionCount, companion_names: body.companionNames };
          return route.fulfill({ json: { result: existingDecline ? "linked" : "created" } });
        }
        if (request.method() === "PATCH" && path === (scope === "group" ? "/api/admin/groups/g1/members" : "/api/admin/invitees")) {
          const body = request.postDataJSON();
          phoneRequests.push(body);
          member.phone = body.phone;
          return route.fulfill({ json: { member } });
        }
        if (path === "/api/admin/guest-guide") {
          if (request.method() === "GET") {
            return route.fulfill({ json: { recipients: member.rsvp?.attending ? [recipient()] : [], smsReady: true } });
          }
          const body = request.postDataJSON();
          guideActions.push(body);
          if (body.action === "prepare") {
            return route.fulfill({ json: { recipients: [{ ...recipient(), url: guideUrl, message: `${member.name}님, 예식 전 안내를 확인해주세요. ${guideUrl}`, reviewToken: "review" }] } });
          }
          return route.fulfill({ json: { id: member.rsvp_id, status: "accepted" } });
        }
        const json = path === "/api/admin/login" ? { ok: true }
          : path === "/api/admin/groups" ? { groups: scope === "group" ? [{ id: "g1", name: "테스트 모임", slug: "t", roster_count: 1, member_count: 0 }] : [], total_members: 1 }
          : path === "/api/admin/groups/g1/members" || path === "/api/admin/invitees" ? { members: [member] }
          : path === "/api/admin/deliveries" ? { deliveries: [] } : {};
        await route.fulfill({ json });
      });

      await page.goto("/admin");
      await page.getByRole("button", { name: "그룹", exact: true }).click();
      await page.getByRole("button", { name: scope === "group" ? "명단 ▼" : /개별 초대/, exact: scope === "group" }).click();
      const row = page.locator("li").filter({ has: page.getByRole("textbox", { name: "안내하객 연락처", exact: true }) });
      const action = existingDecline ? "참석으로 변경" : "참석 등록";
      await row.getByRole("button", { name: action, exact: true }).click();
      if (existingDecline) {
        await expect(row.getByRole("button", { name: "신부측", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(row.getByRole("textbox", { name: "동반 인원수", exact: true })).toHaveValue("1");
        await expect(row.getByRole("textbox", { name: "동반자 1 이름", exact: true })).toHaveValue("기존동반하객");
        await expect(row.getByRole("textbox", { name: "안내하객 참석 연락처", exact: true })).toHaveCount(0);
      }
      await row.getByRole("button", { name: "신랑측", exact: true }).click();
      await row.getByRole("button", { name: "동반 인원 늘리기", exact: true }).click();
      await row.getByRole("textbox", { name: `동반자 ${existingDecline ? 2 : 1} 이름`, exact: true }).fill("동반하객");
      await row.getByRole("button", { name: existingDecline ? "참석으로 변경" : "참석자로 등록", exact: true }).last().click();
      await expect(row.getByRole("button", { name: "인원 수정", exact: true })).toBeVisible();
      expect(attendanceRequests).toHaveLength(1);
      expect(attendanceRequests[0]).toEqual({
        method: "POST",
        body: { side: "groom", companionCount: existingDecline ? 2 : 1, companionNames: existingDecline ? ["기존동반하객", "동반하객"] : ["동반하객"], ...(existingDecline ? {} : { phone: "010-1111-2222" }) },
      });
      const phone = row.getByRole("textbox", { name: "안내하객 연락처", exact: true });
      await phone.fill("010-3333-4444");
      await phone.blur();
      await expect.poll(() => phoneRequests).toEqual([{ member_id: "m1", phone: "010-3333-4444" }]);

      await page.getByRole("button", { name: "사전 안내", exact: true }).click();
      await expect(page.getByText("참석 신청 1건", { exact: false })).toBeVisible();
      const guideRow = page.locator("li").filter({ hasText: "안내하객" });
      await expect(guideRow).toContainText("010-****-4444");
      await expect(guideRow).toContainText("안내 미확인");
      await guideRow.getByRole("checkbox").check();
      await page.getByRole("button", { name: "선택 1명 문구·개인 링크 확인", exact: true }).click();
      const preview = page.getByRole("region", { name: "발송 내용 확인", exact: true });
      await expect(preview.getByRole("heading", { name: "안내하객", exact: true })).toBeVisible();
      await expect(preview).toContainText(guideUrl);
      await expect(preview.getByRole("button", { name: "선택 1명에게 문자 발송", exact: true })).toBeDisabled();
      expect(guideActions).toEqual([{ action: "prepare", ids: ["r1"] }]);
    });
  }
}
