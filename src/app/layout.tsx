import type { Metadata } from "next";
import { Hanken_Grotesk, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// Body / UI voice — warm humanist grotesque, calm and highly legible for dense job data.
const sans = Hanken_Grotesk({
  variable: "--ff-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--ff-mono",
  subsets: ["latin"],
  display: "swap",
});

// Display voice — humanist grotesque with warmth and optimism; carries the mood in headings.
const display = Bricolage_Grotesque({
  variable: "--ff-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Job Matcher",
  description: "Upload your CV, answer a few questions, get ranked job matches.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
