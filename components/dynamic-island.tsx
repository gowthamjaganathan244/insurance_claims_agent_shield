"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
const links = [
  ["/", "Command"],
  ["/claims", "Claims"],
  ["/security", "Security"],
  ["/reliability", "Reliability"],
  ["/communications", "Communications"],
];
export function DynamicIsland({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  return (
    <Island key={pathname} pathname={pathname} displayName={displayName} />
  );
}
function Island({
  pathname,
  displayName,
}: {
  pathname: string;
  displayName: string;
}) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const island = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const active = pathname.startsWith("/claim/") ? "/claims" : pathname;
  const label = links.find(([href]) => href === active)?.[1] ?? "Command";
  useEffect(() => {
    const media = matchMedia("(max-width:640px)");
    let previous = window.scrollY;
    let frame = 0;
    const sync = () => {
      setCompact(media.matches || window.scrollY > 76);
      setOpen(false);
    };
    sync();
    const scroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = Math.max(0, window.scrollY);
        const delta = y - previous;
        if (Math.abs(delta) > 4) setOpen(false);
        if (y < 48) setCompact(media.matches);
        else if (delta > 5 && y > 76) setCompact(true);
        else if (delta < -9) setCompact(media.matches);
        previous = y;
      });
    };
    const outside = (event: PointerEvent) => {
      if (!island.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() =>
          toggle.current?.focus({ preventScroll: true }),
        );
      }
    };
    window.addEventListener("scroll", scroll, { passive: true });
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    media.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scroll);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      media.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => {
    if (open)
      island.current
        ?.querySelector<HTMLAnchorElement>('nav a[aria-current="page"]')
        ?.focus({ preventScroll: true });
  }, [open]);
  return (
    <header>
      <div
        ref={island}
        className={`isl ${compact ? "mini" : ""} ${open ? "open" : ""}`}
      >
        <Link
          prefetch={false}
          className="brand"
          href="/"
          aria-label="AgentShield AU command"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M12 2.5 4 6v6c0 4.6 3.2 8.2 8 9.5 4.8-1.3 8-4.9 8-9.5V6l-8-3.5Z" />
            <path d="m8.5 12 2.5 2.5 4.5-5" stroke="#73dba4" />
          </svg>
          <b className="bn">
            AgentShield <small>AU</small>
          </b>
        </Link>
        <button
          ref={toggle}
          className="cw"
          type="button"
          aria-label={`${label}${pathname.startsWith("/claim/") ? ` ${pathname.split("/").pop()}` : ""} — open navigation`}
          aria-expanded={!compact || open}
          aria-controls="primary-nav"
          onClick={() => setOpen((value) => !value)}
        >
          <b>
            {label}
            {pathname.startsWith("/claim/") && (
              <i>{pathname.split("/").pop()}</i>
            )}
          </b>
        </button>
        <nav
          id="primary-nav"
          aria-label="Primary"
          className="lk"
          inert={compact && !open}
        >
          <div className="pill">
            {links.map(([href, name]) => (
              <Link
                prefetch={false}
                key={href}
                href={href}
                aria-current={active === href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {name}
              </Link>
            ))}
            <a href="/logout" className="account-link" title={displayName}>
              Account / Sign out
            </a>
          </div>
        </nav>
        <div className="live" role="status">
          <i
            className="dot"
            style={{ background: "var(--mut)" }}
            aria-hidden="true"
          />
          <span>Health unavailable</span>
        </div>
      </div>
    </header>
  );
}
