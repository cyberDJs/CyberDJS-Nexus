import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Command Center",
  description: "Multi-project planning and tracking dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
