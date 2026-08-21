/**
 * CSV 셀 이스케이프 (관리자 내보내기 공용).
 * - CSV 수식 인젝션 방어: 하객 입력이 =, +, -, @, 탭, CR 로 시작하면 Excel 이 수식으로
 *   실행할 수 있으므로 ' 를 앞에 붙여 무력화
 * - 쉼표·따옴표·개행 포함 시 "…" 로 감싸고 내부 따옴표는 ""
 */
export function csvEscape(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀 호환 CSV 본문 (UTF-8 BOM + CRLF) */
export function toCsv(header: string[], rows: unknown[][]): string {
  return (
    "﻿" +
    [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n")
  );
}
