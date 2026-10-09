"use client";
import { useId, type ReactNode } from "react";
export function Tabs({
  labels,
  active,
  onChange,
  children,
  label,
}: {
  labels: string[];
  active: number;
  onChange: (index: number) => void;
  children: ReactNode;
  label: string;
}) {
  const id = useId();
  return (
    <>
      <div className="tabs" role="tablist" aria-label={label}>
        {labels.map((name, index) => (
          <button
            key={name}
            id={`${id}-tab-${index}`}
            role="tab"
            type="button"
            aria-selected={active === index}
            aria-controls={`${id}-panel`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => onChange(index)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight")
                next = (index + 1) % labels.length;
              else if (event.key === "ArrowLeft")
                next = (index + labels.length - 1) % labels.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = labels.length - 1;
              else return;
              event.preventDefault();
              onChange(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
        className="tab-panel"
        key={active}
      >
        {children}
      </div>
    </>
  );
}
