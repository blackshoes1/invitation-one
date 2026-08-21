/** 콘텐츠 탭 섹션 공용 타입 */

/** 설정 저장 (value null = 삭제 → 기본값 폴백) — ContentTab 컨테이너가 제공 */
export type SaveSetting = (key: string, value: unknown, msg?: string) => Promise<boolean>;
