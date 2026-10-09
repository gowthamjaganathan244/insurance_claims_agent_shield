"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
export function MotionPreferences() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // Preserve incoming links from the original single-file application.
    const legacy = location.hash.slice(1);
    if (
      /^\/(claims|security|reliability|communications|claim\/CLM-\d+)?$/.test(
        legacy,
      )
    )
      router.replace(legacy || "/");
  }, [router]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const sync = () => {
      document.documentElement.dataset.motion =
        media.matches ||
        (device.deviceMemory !== undefined && device.deviceMemory <= 4) ||
        navigator.hardwareConcurrency <= 4 ||
        device.connection?.saveData
          ? "reduced"
          : "full";
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    let frame = 0;
    const background = document.getElementById("bg");
    if (
      !matchMedia("(hover:hover) and (min-width:861px)").matches ||
      document.documentElement.dataset.motion === "reduced"
    )
      return;
    const move = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (document.documentElement.dataset.motion === "reduced") return;
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>(".lq")
            : null;
        if (target) {
          const rect = target.getBoundingClientRect();
          target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
          target.style.setProperty("--my", `${event.clientY - rect.top}px`);
        }
        background?.style.setProperty(
          "--px",
          String(event.clientX / innerWidth - 0.5),
        );
        background?.style.setProperty(
          "--py",
          String(event.clientY / innerHeight - 0.5),
        );
      });
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return null;
}
