import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taste Match",
  description: "An interactive music taste Venn diagram for friends.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
