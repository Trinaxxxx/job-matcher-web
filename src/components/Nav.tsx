"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/results", label: "Results" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-subtle bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 text-sm sm:gap-2">
        <Link
          href="/dashboard"
          className="mr-3 flex items-center gap-2 font-display text-base font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[13px] font-bold text-[var(--accent-fg)]"
          >
            jm
          </span>
          Job Matcher
        </Link>
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
        <div className="ml-auto">
          <LogoutButton />
        </div>
      </nav>
    </header>
  );
}
