import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "터무니 (Tumuni) | 터를 읽고 무니를 더하다",
  description: "위치와 조건을 입력하면 실거래·법령·권리 근거를 모아 터무니있는 검토를 시작합니다."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
