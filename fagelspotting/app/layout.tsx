import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "Fågelspotting",
  description: "Fota en fågel, låt AI:n känna igen arten, samla poäng och klättra på topplistan.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fågelspotting",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1712",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
