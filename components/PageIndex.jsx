"use client";

// 1.1.11 (UI review): an "On this page" index for long tabs. It lists every
// element inside `rootRef` marked data-index="Label" (first of each label),
// stays at the top while you scroll, jumps to a section on click and
// highlights the section on screen.
import { useEffect, useState } from "react";

export default function PageIndex({ rootRef, testId = "page-index" }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState("");
  useEffect(() => {
    const root = rootRef?.current;
    if (!root) return undefined;
    const collect = () => {
      const seen = new Set();
      const next = [];
      for (const el of root.querySelectorAll("[data-index]")) {
        const label = el.getAttribute("data-index");
        if (!label || seen.has(label)) continue;
        seen.add(label);
        next.push({ label, el });
      }
      setItems((cur) => (cur.map((x) => x.label).join("|") === next.map((x) => x.label).join("|") ? cur : next));
    };
    collect();
    const mo = new MutationObserver(collect);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [rootRef]);
  useEffect(() => {
    if (!items.length || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.getAttribute("data-index"));
    }, { rootMargin: "-80px 0px -60% 0px" });
    for (const x of items) io.observe(x.el);
    return () => io.disconnect();
  }, [items]);
  if (items.length < 3) return null;
  return (
    <nav aria-label="On this page" className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur" data-testid={testId}>
      <span className="mr-1 font-semibold text-gray-700">On this page</span>
      {items.map((x) => (
        <button key={x.label} type="button" onClick={() => { x.el.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(x.label); }}
          aria-current={active === x.label ? "location" : undefined}
          className={`rounded-full px-2.5 py-1 ${active === x.label ? "bg-blue-100 font-semibold text-blue-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
          {x.label}
        </button>
      ))}
    </nav>
  );
}
