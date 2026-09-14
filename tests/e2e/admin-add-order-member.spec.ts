import { test, expect } from "@playwright/test";

test("주문에서 명단 개인 검색·추가·인원 갱신, 중복 및 완료 주문 차단", async ({ page }) => {
  const participants: object[] = [];
  let additions = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route("**/api/admin/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: object = {};
    if (path === '/api/admin/login') json = { ok: true };
    if (path === '/api/admin/groups') json = { groups: [{ id: 'g1', name: '친구', slug: 'friends' }] };
    if (path === '/api/admin/deliveries') json = { deliveries: [
      { id: 'd1', group_id: 'g1', date: '2026-09-28', time_slot: '저녁', location: '서울', status: '대기중', participants },
      { id: 'd2', group_id: 'g1', date: '2026-09-28', time_slot: '저녁', location: '서울', status: '완료', participants: [] },
    ] };
    if (path === '/api/admin/groups/g1/members') json = { members: [
      { id: 'm1', name: '테스트개인', phone: null, applied: additions > 0 },
      { id: 'm2', name: '기존신청자', phone: '010-1234-5678', applied: true },
    ] };
    if (path === '/api/admin/deliveries/d1/members') {
      expect(route.request().postDataJSON()).toEqual({ member_id: 'm1' });
      additions++; participants.push({ id: 'p1', name: '테스트개인', phone: null, is_owner: false });
      json = { result: 'added' };
    }
    await route.fulfill({ json });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: '주문', exact: true }).click();
  await expect(page.getByRole('button', { name: '명단에서 추가', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '명단에서 추가', exact: true }).click();
  await expect(page.getByRole('button', { name: '기존신청자 추가', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '추가할 개인 검색' }).fill('테스트개인');
  await page.getByRole('button', { name: '테스트개인 추가', exact: true }).click();
  await expect(page.getByText('테스트개인님을 추가했습니다.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '테스트개인 추가', exact: true })).toBeDisabled();
  await expect(page.getByText('👥 1명', { exact: false })).toBeVisible();
  expect(additions).toBe(1); expect(errors).toEqual([]);
});
