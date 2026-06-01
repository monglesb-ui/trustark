import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "트러스트 아크(Trust Ark) | 부동산 RAG 의사결정 코파일럿",
  description: "계약 전 위험 신호를 mock data와 RAG 근거로 점검하는 웹 데모"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
