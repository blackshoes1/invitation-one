"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
    ChevronDown,
    Copy,
    Check,
    CheckCircle,
    MapPin,
    Navigation,
    Phone,
} from "lucide-react";

// 1. 타입 확정(Type Widening) 방어용 상용 애니메이션 프리셋
const fadeInUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.8, ease: "easeOut" },
} as const;

/* ==========================================================================
   🏛️ 메인 엔트리 포인트 (Next.js가 요구하는 default 래퍼 컴포넌트)
   ========================================================================== */
export default function Home() {
    return (
        <div className="w-full min-h-screen bg-white font-sans text-neutral-800 antialiased selection:bg-luxury-accent/10">
            {/* 1. 첫 화면 (메인 히어로 섹션) */}
            <HeroSection />

            {/* 2. 소중한 분들께 (초대 인사말 섹션) */}
            <GreetingSection />

            {/* 3. 오시는 길 (지도 및 내비게이션 딥링크 섹션) */}
            <LocationSection />

            {/* 4. 마음 전하실 곳 (축의대 미운영 공지 + 계좌이체 섹션) */}
            <AccountSection />

            {/* 5. 참석 회신 (미민멀 참석 안내 인풋 폼 섹션) */}
            <RsvpSection />
        </div>
    );
}

/* ==========================================
   🖼️ 1. 첫 화면 컴포넌트 (HeroSection)
   ========================================== */
function HeroSection() {
    return (
        <section className="relative w-full aspect-[3/4] max-w-[450px] mx-auto flex flex-col justify-between py-16 px-6 overflow-hidden bg-neutral-50">
            {/* 백엔드 최적화 바이패스 unoptimized 주입 완료 */}
            <Image
                src="/pic/wedding_main.jpg"
                alt="메인 웨딩 사진"
                fill
                priority
                unoptimized
                className="object-cover filter grayscale-[15%] contrast-[95%] z-0"
            />
            {/* 시네마틱 딤 레이어 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 z-1" />

            {/* 상단 텍스트 */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1 }}
                className="text-center space-y-2 z-10 text-white"
            >
                <h1 className="text-base font-light tracking-[0.2em]">
                    소중한 분들을 초대합니다
                </h1>
            </motion.div>

            {/* 하단 정보 레이어 */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.4 }}
                className="text-center space-y-4 z-10 text-white"
            >
                <div className="text-xl font-light tracking-[0.2em] space-x-2">
                    <span>성근영</span>
                    <span className="text-sm opacity-60 font-serif">&</span>
                    <span>김아영</span>
                </div>
                <div className="text-[11px] tracking-widest opacity-90 font-light space-y-1">
                    <p>2026년 10월 18일 토요일 오전 11시</p>
                    <p>서울 용산 가족공원</p>
                </div>
            </motion.div>
        </section>
    );
}

/* ==========================================
   🌸 2. 소중한 분들께 컴포넌트 (GreetingSection)
   ========================================== */
function GreetingSection() {
    return (
        <section className="px-6 py-32 text-center max-w-sm mx-auto space-y-12">
            <motion.div
                {...fadeInUp}
                className="space-y-6 text-luxury-primary leading-loose tracking-wide text-sm font-light"
            >
                <p>
                    각자 재미있게 잘 살던 저희 두 사람이 만나
                    <br />
                    이제 매일을 복작복작 함께 지내보려 합니다.
                    <br />
                </p>
                <p>
                    햇살 좋은 날, 저희의 새로운 출발을
                    <br />
                    가까이서 축하해 주시면 참 좋겠습니다.
                </p>
                <p>
                    부담 없이 걸음 하셔서
                    <br />
                    그저 즐거운 하루를 함께 채워주세요.
                </p>
            </motion.div>

            <motion.div
                {...fadeInUp}
                className="w-12 border-t border-luxury-accent/30 mx-auto"
            />

            {/* 한글로 정갈하게 정렬한 혼주 정보 레이어 */}
            <motion.div
                {...fadeInUp}
                className="space-y-3 text-sm text-luxury-primary font-light tracking-wide"
            >
                <div className="flex justify-center items-center gap-2">
                    <span className="text-xs text-luxury-muted w-14 text-right">
                        신랑 모
                    </span>
                    <span className="font-normal text-neutral-700">김도윤</span>
                    <span className="text-xs text-luxury-muted">의 장남</span>
                    <span className="font-normal text-luxury-primary ml-1">
                        성근영
                    </span>
                </div>
                <div className="flex justify-center items-center gap-2">
                    <span className="text-xs text-luxury-muted w-14 text-right">
                        신부 부모
                    </span>
                    <span className="font-normal text-neutral-700">이동희</span>
                    <span className="text-xs text-luxury-muted">의 차녀</span>
                    <span className="font-normal text-luxury-primary ml-1">
                        김아영
                    </span>
                </div>
            </motion.div>
        </section>
    );
}

/* ==========================================
   🗺️ 3. 오시는 길 컴포넌트 (LocationSection)
   ========================================== */
function LocationSection() {
    const weddingHall = {
        name: "서울 용산가족공원",
        address: "서울 용산구 서빙고로 137",
        tel: "02-792-5661",
        links: {
            naver: "https://map.naver.com/",
            kakao: "https://map.kakao.com/",
            tmap: "https://tmap.to/",
        },
    };

    return (
        <section className="px-6 py-28 bg-neutral-50/40 border-t border-luxury-accent/10">
            <div className="max-w-sm mx-auto space-y-10 text-center">
                <motion.div {...fadeInUp} className="space-y-2">
                    <p className="font-sans tracking-[0.3em] text-[11px] text-luxury-accent font-semibold">
                        위치 안내
                    </p>
                    <h2 className="text-xl font-light tracking-widest text-luxury-primary">
                        오시는 길
                    </h2>
                </motion.div>

                <motion.div
                    {...fadeInUp}
                    className="space-y-2 text-sm font-light text-luxury-primary tracking-wide"
                >
                    <p className="font-normal text-base">{weddingHall.name}</p>
                    <p className="text-luxury-muted text-xs">
                        {weddingHall.address}
                    </p>
                    <div className="flex justify-center items-center gap-1 text-xs text-luxury-accent mt-2">
                        <Phone size={11} />
                        <a
                            href={`tel:${weddingHall.tel}`}
                            className="underline"
                        >
                            {weddingHall.tel}
                        </a>
                    </div>
                </motion.div>

                {/* 정적 맵 프레임 */}
                <motion.div
                    {...fadeInUp}
                    className="relative w-full aspect-[4/3] bg-neutral-200 shadow-xs border border-luxury-accent/10 overflow-hidden"
                >
                    <div
                        className="w-full h-full bg-cover bg-center filter contrast-[92%] grayscale-[10%]"
                        style={{
                            backgroundImage: `url('https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=600')`,
                        }}
                    />
                    <div className="absolute bottom-3 right-3 bg-luxury-primary/80 backdrop-blur-xs text-white px-2 py-0.5 rounded-[2px] text-[10px] tracking-widest flex items-center gap-1 font-light">
                        <MapPin size={10} /> 용산가족공원 인근
                    </div>
                </motion.div>

                {/* 내비게이션 연동 버튼 그룹 */}
                <motion.div
                    {...fadeInUp}
                    className="grid grid-cols-3 gap-3 w-full"
                >
                    {[
                        ["네이버 지도", weddingHall.links.naver],
                        ["카카오 맵", weddingHall.links.kakao],
                        ["티맵", weddingHall.links.tmap],
                    ].map(([title, link]) => (
                        <a
                            key={title}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center justify-center py-3 border border-luxury-accent/20 bg-white hover:bg-neutral-50/50 transition-colors shadow-xs space-y-1 text-[11px] text-neutral-600 font-light tracking-wider"
                        >
                            <span>{title}</span>
                            <Navigation
                                size={11}
                                className="text-luxury-accent rotate-45"
                            />
                        </a>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

/* ==========================================
   💳 4. 마음 전하실 곳 컴포넌트 (AccountSection)
   ========================================== */
function AccountSection() {
    return (
        <section className="px-6 py-32 bg-luxury-bg border-t border-luxury-accent/10">
            <div className="max-w-sm mx-auto space-y-12 text-center">
                <motion.div {...fadeInUp} className="space-y-3">
                    <p className="font-sans tracking-[0.3em] text-[11px] text-luxury-accent font-semibold">
                        마음 전하실 곳
                    </p>

                    <div className="text-xs text-luxury-muted max-w-[300px] mx-auto leading-loose font-light pt-3 space-y-3">
                        <p className="tracking-wide">
                            저희의 예식은 하객 여러분과 더 깊게 눈을 맞추고{" "}
                            <br />
                            축하를 나누고자{" "}
                            <span className="font-normal text-luxury-primary border-b border-luxury-accent/40 pb-0.5">
                                현장 축의대를 운영하지 않습니다.
                            </span>
                        </p>
                        <p className="text-[11px] text-luxury-accent/80 pt-2 tracking-wider">
                            따뜻한 마음을 전하고자 하시는 분들을 위해 <br />
                            계좌 번호를 안내해 드리오니 너른 양해를
                            부탁드립니다.
                        </p>
                    </div>
                </motion.div>

                <div className="space-y-3 pt-2">
                    <AccountAccordion title="신랑측 계좌번호" side="groom" />
                    <AccountAccordion title="신부측 계좌번호" side="bride" />
                </div>
            </div>
        </section>
    );
}

function AccountAccordion({
    title,
    side,
}: {
    title: string;
    side: "groom" | "bride";
}) {
    const [isOpen, setIsOpen] = useState(false);

    const accounts =
        side === "groom"
            ? [
                  {
                      role: "신랑",
                      name: "성근영",
                      bank: "신한은행",
                      number: "110-123-456789",
                  },
              ]
            : [
                  {
                      role: "신부",
                      name: "김아영",
                      bank: "우리은행",
                      number: "1002-123-456789",
                  },
              ];

    return (
        <div className="bg-white border border-luxury-accent/10 shadow-xs transition-all duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex justify-between items-center bg-white hover:bg-neutral-50/30 transition-colors text-sm text-luxury-primary font-light tracking-widest"
            >
                <span>{title}</span>
                <ChevronDown
                    size={14}
                    className={`text-luxury-accent/70 transition-transform duration-300 ${
                        isOpen ? "rotate-180" : ""
                    }`}
                />
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="border-t border-luxury-accent/5 bg-neutral-50/20"
                    >
                        <div className="p-6 space-y-5 divide-y divide-luxury-accent/5">
                            {accounts.map((acc, index) => (
                                <AccountRow
                                    key={index}
                                    acc={acc}
                                    isFirst={index === 0}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function AccountRow({ acc, isFirst }: { acc: any; isFirst: boolean }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className={`text-left ${isFirst ? "pt-0" : "pt-4"}`}>
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <p className="text-[11px] text-luxury-accent font-medium tracking-wider">
                        {acc.role}{" "}
                        <span className="text-luxury-primary font-light ml-1">
                            {acc.name}
                        </span>
                    </p>
                    <p className="text-sm font-light tracking-wide text-luxury-primary">
                        {acc.bank}{" "}
                        <span className="text-xs font-mono tracking-tighter text-neutral-500 ml-1">
                            {acc.number}
                        </span>
                    </p>
                </div>

                <button
                    onClick={() => handleCopy(acc.number)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-luxury-accent/20 text-[11px] text-luxury-muted hover:text-luxury-accent hover:border-luxury-accent transition-all tracking-wide bg-white min-w-[70px] justify-center"
                >
                    {copied ? (
                        <span className="text-emerald-600 font-medium">
                            완료
                        </span>
                    ) : (
                        <span>복사</span>
                    )}
                </button>
            </div>
        </div>
    );
}

/* ==========================================
   ✍️ 5. 참석 회신 컴포넌트 (RsvpSection)
   ========================================== */
function RsvpSection() {
    const [formData, setFormData] = useState({
        name: "",
        side: "groom",
        attending: "true",
        companionCount: 0,
        eating: "yes",
        memo: "",
    });
    const [isSubmitted, setIsSubmitted] = useState(false);

    return (
        <section className="px-6 py-32 bg-neutral-50/30 border-t border-luxury-accent/10">
            <div className="max-w-sm mx-auto space-y-10 text-center">
                <motion.div {...fadeInUp} className="space-y-3">
                    <p className="font-sans tracking-[0.3em] text-[11px] text-luxury-accent font-semibold">
                        참석 회신
                    </p>
                    <h2 className="text-xl font-light tracking-[0.15em] text-luxury-primary">
                        참석 여부 안내
                    </h2>
                    <p className="text-xs text-luxury-muted leading-loose font-light pt-2 max-w-[280px] mx-auto">
                        소중한 분들을 모시는 자리에 식사 준비와 <br />
                        원활한 예식 진행을 위해 참석 여부를 알려주시면
                        감사하겠습니다.
                    </p>
                </motion.div>

                {!isSubmitted ? (
                    <motion.form
                        {...fadeInUp}
                        onSubmit={(e) => {
                            e.preventDefault();
                            setIsSubmitted(true);
                        }}
                        className="text-left space-y-7 bg-white p-8 border border-luxury-accent/10 shadow-xs text-sm font-light"
                    >
                        {/* 성함 입력창 */}
                        <div className="space-y-2">
                            <label className="text-[11px] text-luxury-accent font-medium tracking-wider">
                                성함
                            </label>
                            <input
                                type="text"
                                required
                                className="w-full pb-2 border-b border-luxury-accent/20 bg-transparent focus:outline-none focus:border-luxury-primary transition-colors text-luxury-primary tracking-wide placeholder:text-neutral-300 font-light rounded-none"
                                placeholder="성함을 기입해 주세요"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        name: e.target.value,
                                    })
                                }
                            />
                        </div>

                        {/* 구분 토글 */}
                        <div className="space-y-2">
                            <label className="text-[11px] text-luxury-accent font-medium tracking-wider">
                                구분
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                                {["groom", "bride"].map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        className={`py-2 text-xs tracking-widest transition-all border-b-2 ${
                                            formData.side === s
                                                ? "border-luxury-accent text-luxury-primary font-normal"
                                                : "border-transparent text-neutral-400"
                                        }`}
                                        onClick={() =>
                                            setFormData({
                                                ...formData,
                                                side: s,
                                            })
                                        }
                                    >
                                        {s === "groom"
                                            ? "신랑측 하객"
                                            : "신부측 하객"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 참석 여부 플래그 */}
                        <div className="space-y-2">
                            <label className="text-[11px] text-luxury-accent font-medium tracking-wider">
                                참석 여부
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: "참석합니다", value: "true" },
                                    {
                                        label: "마음으로 축하합니다",
                                        value: "false",
                                    },
                                ].map((item) => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className={`py-2 text-xs tracking-wider transition-all border-b-2 ${
                                            formData.attending === item.value
                                                ? "border-luxury-accent text-luxury-primary font-normal"
                                                : "border-transparent text-neutral-400"
                                        }`}
                                        onClick={() =>
                                            setFormData({
                                                ...formData,
                                                attending: item.value,
                                                eating:
                                                    item.value === "true"
                                                        ? "yes"
                                                        : "no",
                                            })
                                        }
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 유동 필드 */}
                        {formData.attending === "true" && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="space-y-6 pt-2"
                            >
                                <div className="space-y-2">
                                    <label className="text-[11px] text-luxury-accent font-medium tracking-wider">
                                        동반 인원 (본인 제외)
                                    </label>
                                    <select
                                        className="w-full pb-2 border-b border-luxury-accent/20 bg-transparent focus:outline-none focus:border-luxury-primary transition-colors text-luxury-primary font-light rounded-none"
                                        value={formData.companionCount}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                companionCount: Number(
                                                    e.target.value
                                                ),
                                            })
                                        }
                                    >
                                        {[0, 1, 2, 3, 4].map((num) => (
                                            <option
                                                key={num}
                                                value={num}
                                                className="bg-white"
                                            >
                                                {num}명
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] text-luxury-accent font-medium tracking-wider">
                                        식사 여부
                                    </label>
                                    <div className="grid grid-cols-3 gap-2 text-[11px] tracking-wider">
                                        {[
                                            { label: "식사함", value: "yes" },
                                            {
                                                label: "식사 안 함",
                                                value: "no",
                                            },
                                            {
                                                label: "미정",
                                                value: "undecided",
                                            },
                                        ].map((item) => (
                                            <button
                                                key={item.value}
                                                type="button"
                                                className={`py-1.5 transition-all border ${
                                                    formData.eating ===
                                                    item.value
                                                        ? "border-luxury-primary bg-luxury-primary text-white"
                                                        : "border-luxury-accent/15 text-neutral-400"
                                                }`}
                                                onClick={() =>
                                                    setFormData({
                                                        ...formData,
                                                        eating: item.value,
                                                    })
                                                }
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* 메시지 */}
                        <div className="space-y-2">
                            <label className="text-[11px] text-luxury-accent font-medium tracking-wider">
                                전하실 말씀
                            </label>
                            <textarea
                                className="w-full p-3 border border-luxury-accent/15 bg-neutral-50/40 focus:outline-none focus:border-luxury-accent transition-colors resize-none h-20 text-xs font-light tracking-wide placeholder:text-neutral-300"
                                placeholder="축하 메시지나 축의대 미운영에 따른 전달 사항을 적어주세요"
                                value={formData.memo}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        memo: e.target.value,
                                    })
                                }
                            />
                        </div>

                        {/* 전송 버튼 */}
                        <button
                            type="submit"
                            className="w-full py-3.5 bg-luxury-primary text-white font-light tracking-[0.2em] hover:bg-luxury-primary/90 transition-colors text-xs"
                        >
                            참석 정보 보내기
                        </button>
                    </motion.form>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-white p-10 border border-luxury-accent/10 shadow-xs space-y-3"
                    >
                        <CheckCircle
                            className="text-luxury-accent mx-auto"
                            size={28}
                            strokeWidth={1}
                        />
                        <p className="text-sm font-normal text-luxury-primary tracking-wide">
                            참석 정보가 정상 전송되었습니다.
                        </p>
                        <p className="text-xs text-luxury-muted leading-loose font-light">
                            축하해 주셔서 진심으로 감사합니다.
                            <br />
                            예식장에서 정중히 모시겠습니다.
                        </p>
                    </motion.div>
                )}
            </div>
        </section>
    );
}
