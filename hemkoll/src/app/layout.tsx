import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hemkoll",
  description: "Koll på huset — vad finns, vad är gjort, vad är värt att göra härnäst",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
