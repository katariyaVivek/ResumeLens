import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResumeLens | AI Resume Screening",
  description: "Recruiter workspace for RAG-powered resume screening and candidate comparison.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrains.variable} min-h-screen bg-paper font-sans text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
