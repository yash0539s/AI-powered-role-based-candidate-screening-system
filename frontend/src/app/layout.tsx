import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Tighter display cut for page titles, KPI values and the wordmark (see DESIGN.md → Typography).
const display = Inter_Tight({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ScreenIQ — AI Technical Screening", template: "%s · ScreenIQ" },
  description: "RAG-powered, role-based technical screening interviews grounded in ML textbooks.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d14" },
  ],
};

// Apply a saved theme before first paint (prevents a light/dark flash).
const themeInit = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <div className="app">
          <Sidebar />
          <div className="main">
            <main className="page" id="main">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
