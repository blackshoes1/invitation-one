/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                luxury: {
                    bg: "#FBFBFA", // 실크 느낌의 우아한 웜 화이트 [cite: 56, 146]
                    primary: "#1A1A1A", // 깊이감 있는 딥 차콜 [cite: 56, 146]
                    accent: "#C5A880", // 은은한 샴페인 골드 [cite: 56, 146]
                    muted: "#737373", // 가독성 확보용 서브 그레이 [cite: 146]
                },
            },
        },
    },
    plugins: [],
};
