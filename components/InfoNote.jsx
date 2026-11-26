"use client";

// 1.1.11 (UI review): a section's one short line, with its rules behind an
// "ⓘ How this works" link instead of a paragraph above every table.
import { useState } from "react";

export default function InfoNote({ short = null, children, testId = "info-note", className = "mb-2" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`text-[11.5px] text-gray-600 ${className}`} data-testid={testId}>
      {short}{short ? " " : ""}
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="whitespace-nowrap font-medium text-blue-700 hover:underline">ⓘ {open ? "Hide" : "How this works"}</button>
      {open && <div className="mt-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11.5px] leading-relaxed text-gray-700" data-testid={`${testId}-body`}>{children}</div>}
    </div>
  );
}
