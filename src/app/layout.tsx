import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Structured Attendance",
  description: "Manajemen kehadiran berbasis hierarki",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}