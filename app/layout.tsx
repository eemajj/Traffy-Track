import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";
import "leaflet/dist/leaflet.css";

const notoSansThai = localFont({
  src: [
    {
      path: "../public/fonts/NotoSansThai-Regular.woff",
      weight: "400",
      style: "normal"
    },
    {
      path: "../public/fonts/NotoSansThai-Bold.woff",
      weight: "700",
      style: "normal"
    }
  ],
  variable: "--font-noto-sans-thai",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา",
  description: "ระบบติดตามเรื่องร้องเรียนจาก CityData และ Traffy Fondue เขตทวีวัฒนา"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body className={`${notoSansThai.className} font-sans`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
