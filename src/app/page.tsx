"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Heart } from "lucide-react";

// 스크롤 시 아래에서 위로 부드럽게 올라오는 애니메이션 프리셋
const fadeInUp = {
    initial: { opacity: 0, y: 40 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.8, ease: "easeOut" },
} as const;

export default function Home() {
    return (
        <div className="w-full bg-luxury-bg pb-32 overflow-x-hidden">
            {/* 1. HERO SECTION: 첫 인상 (시네마틱 레이아웃) */}
            <section className="relative w-full h-screen flex flex-col justify-between items-center px-6 py-16 text-luxury-primary">
                {/* 테두리 디테일 선 */}
                <div className="absolute top-6 left-6 right-6 bottom-6 border border-luxury-accent/20 pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="text-center mt-12 space-y-2 z-10"
                >
                    <p className="font-serif tracking-[0.3em] text-xs text-luxury-accent uppercase">
                        The Wedding Invitation
                    </p>
                    <p className="tracking-[0.15em] text-xs text-luxury-muted">
                        소중한 분들을 초대합니다
                    </p>
                </motion.div>

                {/* ⭕️ 리팩토링된 메인 이미지 영역 */}
                <motion.div
                    initial={{ opacity: 0, scale: 1.03 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.4, ease: "easeOut" }}
                    className="relative w-full max-w-[320px] aspect-[3/4] bg-neutral-100 shadow-2xl overflow-hidden my-auto z-0"
                >
                    <Image
                        src="/pic/wedding_main.jpg" // ⚠️ public/pic/wedding_main.jpg 경로에 파일이 있어야 합니다.
                        alt="메인 웨딩 사진"
                        fill
                        priority
                        unoptimized
                        className="object-cover filter grayscale-[20%] contrast-[95%] z-0"
                    />
                    {/* 사진 위에 은은함을 더해줄 단 하나의 그라데이션 오버레이 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-luxury-primary/40 via-transparent to-transparent z-10 pointer-events-none" />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, delay: 0.4 }}
                    className="text-center mb-8 space-y-4 z-10"
                >
                    <div className="text-lg tracking-[0.2em] flex items-center justify-center gap-3 font-light">
                        <span>성근영</span>
                        <span className="text-luxury-accent font-serif text-sm italic">
                            &
                        </span>
                        <span>김아영</span>
                    </div>
                    <div className="w-8 border-t border-luxury-accent/60 mx-auto" />
                    <div className="tracking-widest text-[11px] space-y-1 text-luxury-muted">
                        <p className="font-serif text-xs">
                            2026. 10. 18. SAT AM 11:00
                        </p>
                        <p>서울 용산 가족공원</p>
                    </div>
                </motion.div>
            </section>

            {/* 2. GREETING SECTION: 여백의 미를 살린 초대 인사말 */}
            <section className="px-6 py-28 text-center max-w-sm mx-auto space-y-12">
                <motion.div
                    {...fadeInUp}
                    className="flex justify-center text-luxury-accent"
                >
                    <Heart size={20} strokeWidth={1} />
                </motion.div>

                <motion.div
                    {...fadeInUp}
                    className="space-y-6 text-luxury-primary leading-relaxed tracking-wide text-sm font-light"
                >
                    <p>
                        서로의 인생에 <br />
                        가장 따뜻한 계절이 되어주겠다는 <br />
                        약속을 하려 합니다.
                    </p>
                    <p>
                        오랜 시간 곁에서 <br />
                        저희의 성장을 지켜봐 주신 <br />
                        소중한 분들을 모십니다.
                    </p>
                    <p>
                        함께하셔서 저희의 새로운 시작을 <br />
                        축복해 주시면 감사하겠습니다.
                    </p>
                </motion.div>

                <motion.div
                    {...fadeInUp}
                    className="w-12 border-t border-luxury-accent/40 mx-auto"
                />

                {/* 혼주 관계 명시 컴포넌트 */}
                <motion.div
                    {...fadeInUp}
                    className="space-y-3 text-sm text-luxury-primary font-light"
                >
                    <div className="flex justify-center items-center gap-2">
                        <span className="text-luxury-muted text-xs">
                            신랑 부모
                        </span>
                        <span className="tracking-wide">이판서 · 김부인</span>
                        <span className="text-luxury-muted text-xs font-serif">
                            의 차남
                        </span>
                        <span className="font-normal">몽룡</span>
                    </div>
                    <div className="flex justify-center items-center gap-2">
                        <span className="text-luxury-muted text-xs">
                            신부 부모
                        </span>
                        <span className="tracking-wide">성참판 · 월매녀</span>
                        <span className="text-luxury-muted text-xs font-serif">
                            의 장녀
                        </span>
                        <span className="font-normal">춘향</span>
                    </div>
                </motion.div>
            </section>
        </div>
    );
}
