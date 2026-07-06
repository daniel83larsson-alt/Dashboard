import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bokio Lite — Bokföring för enskild firma",
  description: "Bokföring, kvitton och revisorsunderlag för enskild firma.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
