"use client";

// 1.1.17 (user, 11/27): the industrial characteristics of an asset, in asset
// setup: Building, and Location and site. Typed in or imported from a file.
// Grey hints show typical ranges and never flag or block an entry; dashed
// boxes are calculated from the facts entered.
import { useEffect, useRef, useState } from "react";
import { BUILDING_FIELDS, FACT_COLUMNS, FACT_DOC_TYPES, SITE_FIELDS, YES_NO_OPTIONS, applyFactDoc, assetFacts, buildingOf, factDocLabel, factDocRows, factDocTag, factDocs, factFlags, factsGrid, importFacts, setFact, siteOf } from "@/lib/assetFacts";
import { createDealDocWithFallback, dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const box = "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
const lab = "text-xs font-medium text-gray-500 uppercase tracking-wide";

function FactField({ section, def, value, onSet }) {
  const [key, label, type, opt = {}] = def;
  const id = `fact-${section}-${key}`;
  const common = { id, "aria-label": label, className: box, "data-testid": id };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={lab}>{label}</label>
      {type === "select" ? (
        <select {...common} value={value ?? ""} onChange={(e) => onSet(section, key, e.target.value)}>{opt.options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select>
      ) : type === "yesno" ? (
        <select {...common} value={value ?? ""} onChange={(e) => onSet(section, key, e.target.value)}>{YES_NO_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      ) : (
        <input {...common} type={type === "date" ? "date" : type === "text" ? "text" : "number"} step={type === "number" ? "any" : type === "text" || type === "date" ? undefined : 1} value={value ?? ""} onChange={(e) => onSet(section, key, e.target.value)} />
      )}
      {opt.hint && <p className="text-[11px] text-gray-400" data-testid={`${id}-hint`}>{opt.hint}</p>}
    </div>
  );
}
function Calc({ label, value, note, tone = "", testId }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className={lab}>{label}</span>
      <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold ${tone}`}>{value ?? "—"}</div>
      {note && <p className="text-[11px] text-gray-400">{note}</p>}
    </div>
  );
}

// The documents the facts are read from: a property condition report, a
// Phase I or II report, a survey, a roof warranty. Uploaded here by hand;
// once Claude has read one, its facts can be applied to the asset.
function FactDocuments({ inputs, onChange, docCtx }) {
  const { workspaceId, dealId, email, canEdit } = docCtx;
  const [docs, setDocs] = useState([]);
  const [kind, setKind] = useState("pcr");
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState("");
  const ref = useRef(null);
  const reload = () => listDealDocs(workspaceId).then(setDocs).catch(() => {});
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = factDocs(docs, dealId);
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await createDealDocWithFallback(workspaceId, { dealId, fundName: inputs.fundName ?? "", docType: "other", title: `${factDocTag(kind)} ${file.name}`, files: [file] }, email);
      await reload();
      setMsg(`Uploaded ${file.name}. Have Claude read it (Library → Documents), then apply its facts here.`);
    } catch (err) { setMsg(`Couldn't upload: ${err.message || err}`); }
  }
  const openFile = async (d) => { const f = d.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); };
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs" data-testid="fact-docs">
      <p className="mb-1 font-semibold text-gray-800">Source documents ({mine.length})</p>
      {msg && <p className="mb-1 rounded bg-blue-50 px-2 py-1 text-blue-900" role="status">{msg}</p>}
      {mine.length === 0 && <p className="text-gray-500">None yet. Upload a property condition report, an environmental report, a survey or a roof warranty.</p>}
      <ul className="space-y-1">
        {mine.map((d) => {
          const rows = factDocRows(d.doc.abstract, inputs);
          const pending = rows.filter((r) => r.now == null || r.differs);
          return (
            <li key={d.id} data-testid="fact-doc">
              <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{factDocLabel(d.kind)}</span>
              <button type="button" onClick={() => openFile(d)} className="text-blue-700 hover:underline">{d.name}</button>
              {rows.length > 0 ? <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="ml-2 rounded border border-gray-300 bg-white px-1.5 text-[10px]" data-testid="fact-doc-facts">{open === d.id ? "Hide facts" : `Facts (${rows.length})`}</button> : <span className="ml-2 text-gray-500">not read yet</span>}
              {open === d.id && (
                <div className="mt-1 rounded border border-gray-200 bg-white p-2" data-testid="fact-doc-panel">
                  <table className="w-full"><thead className="text-gray-500"><tr><th className="text-left font-medium">Fact</th><th className="text-left font-medium">The document says</th><th className="text-left font-medium">The asset has</th></tr></thead>
                    <tbody>{rows.map((r) => <tr key={r.key} className={`align-top ${r.differs ? "bg-amber-50" : ""}`} data-testid="fact-doc-row"><td className="pr-2 text-gray-600">{r.label}</td><td className="pr-2">{r.text}{r.quote && <span className="block text-[10px] italic text-gray-500">&quot;{r.quote}&quot;</span>}</td><td>{r.nowText || "—"}</td></tr>)}</tbody></table>
                  {canEdit && (pending.length > 0
                    ? <button type="button" onClick={() => onChange(applyFactDoc(inputs, d.doc.abstract))} className="mt-1 rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white" data-testid="fact-doc-apply">Apply {pending.length} fact{pending.length === 1 ? "" : "s"} to this asset</button>
                    : <p className="mt-1 text-emerald-700" data-testid="fact-doc-agrees">The asset already holds every fact in this document.</p>)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Document type" value={kind} onChange={(e) => setKind(e.target.value)} className="rounded border border-gray-200 bg-white px-1.5 py-1">{FACT_DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button type="button" onClick={() => ref.current?.click()} className="rounded-lg border border-gray-300 bg-white px-3 py-1 font-medium" data-testid="fact-doc-upload">Upload PDF</button>
          <input ref={ref} type="file" accept="application/pdf" className="hidden" data-testid="fact-doc-file" onChange={onFile} />
        </div>
      )}
    </div>
  );
}

export default function AssetFacts({ inputs, onChange, SectionHeader, docCtx = null }) {
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  const b = buildingOf(inputs), s = siteOf(inputs);
  const f = assetFacts(inputs);
  const flags = factFlags(inputs);
  const onSet = (section, key, raw) => onChange(setFact(inputs, section, key, raw));
  const name = inputs.propertyName || "asset";
  const life = (x) => (x ? `${x.remaining} years (to ${x.endYear})` : null);
  const lifeNote = (x, dflt) => (x ? `from a ${x.life}-year life${x.insideHold ? " · ends inside the hold" : ""}` : `needs the year; ${dflt}-year life unless entered`);
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { gridFromFile } = await import("@/lib/comps");
      const grid = await gridFromFile(file);
      const r = importFacts(grid, [{ id: "this", inputs }]);
      // A file with one data row and no matching name is taken as this asset's.
      const rows = grid.slice(1).filter((x) => x.some((c) => String(c ?? "").trim() !== ""));
      const use = r.matched ? r : rows.length === 1 ? importFacts([grid[0], [name, ...rows[0].slice(1)]], [{ id: "this", inputs: { ...inputs, propertyName: name } }]) : r;
      const up = use.updates.this;
      if (!up) { setMsg(`Nothing imported: no row for ${name}. The first column must be the asset's name.`); return; }
      onChange({ ...inputs, building: up.building, site: up.site });
      setMsg(`Imported ${use.cells} value${use.cells === 1 ? "" : "s"} for ${name}.${use.unknownColumns.length ? ` Columns not recognized: ${use.unknownColumns.join(", ")}.` : ""}`);
    } catch (err) { setMsg(`Couldn't read the file: ${err.message || err}`); }
  }
  const template = async () => downloadBlob(await writeXlsx(factsGrid([{ id: "this", inputs }]), { sheetName: "Asset characteristics" }), `${safeFileName(name)}-characteristics.xlsx`);
  return (
    <>
      <div data-testid="asset-building">
        <SectionHeader title="Building" subtitle="Industrial characteristics. Type them in or import a file; dashed boxes are calculated." />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={template} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50" data-testid="facts-template">Download as Excel</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50" data-testid="facts-import">Import a file</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" data-testid="facts-file" onChange={onFile} />
          <span className="text-gray-500">One row per asset; the first column is the asset&apos;s name ({FACT_COLUMNS.length - 1} columns). Blank cells change nothing.</span>
        </div>
        {msg && <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900" role="status" data-testid="facts-msg">{msg}</p>}
        {flags.length > 0 && <ul className="mb-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="facts-flags">{flags.map((t) => <li key={t}>{t}</li>)}</ul>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BUILDING_FIELDS.map((def) => <FactField key={def[0]} section="building" def={def} value={b[def[0]]} onSet={onSet} />)}
          <Calc testId="calc-sf-per-dock" label="SF per dock door" value={f.sfPerDockDoor != null ? Math.round(f.sfPerDockDoor).toLocaleString("en-US") : null} note="building SF ÷ dock-high doors" />
          <Calc testId="calc-site-coverage" label="Site coverage" value={f.siteCoveragePct != null ? `${f.siteCoveragePct.toFixed(1)}%` : null} note="footprint ÷ land · typical 30–50%" />
          <Calc testId="calc-office" label="Office share" value={f.officePct != null ? `${f.officePct.toFixed(1)}%` : null} note="office SF ÷ building SF · bulk distribution 5–15%" />
          <Calc testId="calc-roof-life" label="Roof remaining useful life" value={life(f.roof)} note={lifeNote(f.roof, 20)} tone={f.roof?.insideHold ? "text-amber-700" : ""} />
          <Calc testId="calc-paving-life" label="Paving remaining useful life" value={life(f.paving)} note={lifeNote(f.paving, 15)} tone={f.paving?.insideHold ? "text-amber-700" : ""} />
        </div>
        {docCtx?.workspaceId && docCtx.dealId && <FactDocuments inputs={inputs} onChange={onChange} docCtx={docCtx} />}
      </div>
      <div data-testid="asset-site">
        <SectionHeader title="Location and site" subtitle="Drayage and last-mile proximity, environmental, zoning and buffer" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SITE_FIELDS.map((def) => <FactField key={def[0]} section="site" def={def} value={s[def[0]]} onSet={onSet} />)}
        </div>
      </div>
    </>
  );
}
