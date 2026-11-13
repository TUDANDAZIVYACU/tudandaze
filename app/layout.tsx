import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "TUDANDAZE.COM",
  description: "Gestion de stock intelligente pour entreprises",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="fr" data-theme="ciel">
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-base-300 text-base-content antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
