"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/results", label: "Results" },
];

/* Drawn 1.7-stroke icon, matching the app's SVG set — never a glyph. */
function MenuIcon({ open }: { open: boolean }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  return open ? (
    <svg {...common}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-subtle bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 text-sm sm:gap-2 sm:px-6">
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="mr-3 flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-base font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[13px] font-bold text-[var(--accent-fg)]"
          >
            jm
          </span>
          <span className="hidden sm:inline">Job Matcher</span>
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-md px-3 py-1.5 transition-colors " +
                  (active
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground")
                }
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
          <ThemeToggle />
          <div className="hidden sm:block">
            <LogoutButton />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:hidden"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </nav>

      {open && (
        <div id="nav-menu" className="border-t border-subtle px-4 py-2 sm:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-md px-3 py-2 text-sm transition-colors " +
                    (active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-foreground")
                  }
                >
                  {label}
                </Link>
              );
            })}
            <div className="mt-1 border-t border-subtle pt-2">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
