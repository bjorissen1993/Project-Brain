import type { Metadata, Viewport } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { AuthSessionProvider } from "@/features/auth";
import { PREFS_BOOT_SCRIPT, UserPrefsProvider } from "@/features/preferences";
import "./globals.css";

const display = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Project Brain",
  description:
    "Game design intelligence workspace. Creator intention is the source of truth.",
};

/** Explicit mobile viewport (incl. notched safe-area via viewport-fit=cover). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1015" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <AuthSessionProvider>
          <UserPrefsProvider>{children}</UserPrefsProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
