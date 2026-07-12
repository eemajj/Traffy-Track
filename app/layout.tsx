import type { Metadata } from "next";

import "./globals.css";
import "leaflet/dist/leaflet.css";

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
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
