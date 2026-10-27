import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "ASSURANCE.COM",
  description: "Gestion de stock intelligente pour entreprises",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="fr" data-theme="retro">
        <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
