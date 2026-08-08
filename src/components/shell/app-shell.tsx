"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Zap } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { NavGlyph, LogoMark } from "./icons";
import { CommandPalette } from "./command-palette";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  athleteName,
  athleteMeta,
  children,
}: {
  athleteName: string;
  athleteMeta: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const current = NAV_ITEMS.find((n) => isActive(pathname, n.href));
  const initials = athleteName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* hover-expand rail (desktop) */}
      <div className="relative w-16 shrink-0 max-md:hidden">
        <aside className="group absolute inset-y-0 left-0 z-30 flex w-16 flex-col overflow-hidden border-r border-border bg-card px-2.5 py-3 transition-[width,box-shadow] duration-200 ease-out hover:w-60 hover:shadow-lift focus-within:w-60 focus-within:shadow-lift">
          <Link href="/" className="flex items-center gap-3 px-0.5 pt-1 pb-3.5">
            <LogoMark />
            <span className="whitespace-nowrap font-bold tracking-tight opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              WOD Assistant
            </span>
          </Link>

          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const on = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl px-2.5 py-2 font-medium transition-colors",
                    on
                      ? "bg-primary/12 text-primary"
                      : "text-muted-fg hover:bg-muted hover:text-ink"
                  )}
                >
                  {on ? (
                    <span className="absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                  ) : null}
                  <span className="shrink-0">
                    <NavGlyph icon={item.icon} />
                  </span>
                  <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5 rounded-xl border border-border p-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
              {initials}
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <b className="block truncate text-[13px]">{athleteName}</b>
              <small className="block truncate text-[11px] text-subtle">{athleteMeta}</small>
            </span>
            <button
              title="Sign out"
              onClick={() => signOut().then(() => router.push("/sign-in"))}
              className="shrink-0 cursor-pointer rounded-full p-1.5 text-subtle opacity-0 transition hover:bg-muted hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <LogOut size={15} />
            </button>
          </div>
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <span className="text-sm text-muted-fg max-md:hidden">
            <b className="font-semibold text-ink">{current?.label ?? "WOD Assistant"}</b>
          </span>
          <span className="md:hidden">
            <LogoMark size={28} />
          </span>
          <CommandPalette />
          <Button variant="primary" onClick={() => router.push("/generate")}>
            <Zap size={14} strokeWidth={2.4} />
            <span className="max-md:hidden">Generate workout</span>
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-canvas p-5 max-md:pb-24">{children}</main>
      </div>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const on = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]",
                on ? "text-primary" : "text-subtle"
              )}
            >
              <NavGlyph icon={item.icon} size={19} />
              {item.label}
            </Link>
          );
        })}
        <MoreSheet pathname={pathname} />
      </nav>
    </div>
  );
}

function MoreSheet({ pathname }: { pathname: string }) {
  const [open, setOpen] = React.useState(false);
  const rest = NAV_ITEMS.slice(4);
  const on = rest.some((r) => isActive(pathname, r.href));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex flex-1 cursor-pointer flex-col items-center gap-1 py-2.5 text-[10px]",
          on ? "text-primary" : "text-subtle"
        )}
      >
        <span className="grid h-[19px] place-items-center text-lg leading-none">···</span>
        More
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full rounded-t-2xl border-t border-border bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] animate-in slide-in-from-bottom duration-200">
            {rest.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-ink"
              >
                <NavGlyph icon={item.icon} />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
