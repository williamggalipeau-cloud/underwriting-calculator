"use client";

// Phase I part 2: asset photos, location map and floor plan (with demising
// and combining units), shown on the Asset Business Plan tab.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  STATUS_COLORS,
  actualNoi,
  addPhotos,
  boxesAfterCombine,
  boxesAfterDemise,
  combineUnits,
  coverPhoto,
  demiseUnit,
  GOOGLE_EMBED_KEY,
  googleEmbedUrl,
  googleMapsLink,
  mapQuery,
  mediaOf,
  movePhoto,
  orderedPhotos,
  removePhoto,
  schematicLayout,
  setBox,
  setCover,
  setFloorPlan,
  unitStatus,
  updatePhoto,
} from "@/lib/assetMedia";
import { assetFileLinks, checkAssetFile, removeAssetFiles, uploadAssetFile } from "@/lib/assetPhotos";

const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => (isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");

function Section({ title, children, right, testId }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function AssetMedia({ dealId, inputs, canEdit, workspaceId, onApplyDeal }) {
  const media = useMemo(() => mediaOf(inputs), [inputs]);
  const units = useMemo(() => inputs.units ?? [], [inputs.units]);
  const name = inputs.propertyName || "This asset";
  const [links, setLinks] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef(null);
  const planRef = useRef(null);
  const paths = useMemo(() => [...media.photos.map((p) => p.path), media.floorPlan?.path].filter(Boolean), [media]);
  const pathKey = paths.join("|");

  useEffect(() => {
    if (!workspaceId || !paths.length) return;
    let live = true;
    assetFileLinks(paths.filter((p) => !links[p])).then((l) => live && setLinks((prev) => ({ ...prev, ...l }))).catch((e) => live && setMsg({ error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, pathKey]);

  const saveMedia = (next, entries, label) => onApplyDeal(dealId, (inp) => ({ ...inp, assetMedia: typeof next === "function" ? next(mediaOf(inp)) : next }), entries, label);
  const canUpload = canEdit && !!workspaceId;

  // ── Photos ──
  async function addFiles(files) {
    const list = [...files];
    const bad = list.map((f) => checkAssetFile(f)).find(Boolean);
    if (bad) { setMsg({ error: bad }); return; }
    setBusy(true); setMsg(null);
    try {
      const up = [];
      for (const f of list) up.push(await uploadAssetFile(workspaceId, dealId, "photos", f));
      saveMedia((m) => addPhotos(m, up, { date: today() }), up.map((u) => ({ key: "assetMedia.photos", field: "Photo added", from: "", to: u.name })), "Asset photos");
      setMsg({ ok: `${up.length} photo${up.length === 1 ? "" : "s"} added.` });
    } catch (e) {
      setMsg({ error: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function deletePhoto(p) {
    if (!window.confirm(`Delete ${p.caption || p.name || "this photo"}?`)) return;
    try {
      await removeAssetFiles([p.path]);
    } catch (e) {
      setMsg({ error: e.message });
      return;
    }
    saveMedia((m) => removePhoto(m, p.id), [{ key: "assetMedia.photos", field: "Photo deleted", from: p.caption || p.name, to: "" }], "Asset photos");
  }

  const photos = orderedPhotos(media);
  const cover = coverPhoto(media);

  return (
    <div className="space-y-4" data-testid="asset-media">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`} data-testid="media-msg">
          {msg.error ?? msg.ok}
        </p>
      )}

      <Section
        title={`Photos · ${name}`}
        testId="asset-photos"
        right={canUpload && (
          <>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" aria-label="Upload photos" onChange={(e) => { addFiles(e.target.files ?? []); e.target.value = ""; }} />
            <button type="button" disabled={busy} className={`${btn} border-blue-600 bg-blue-600 text-white`} onClick={() => photoRef.current?.click()}>{busy ? "Uploading…" : "Add photos"}</button>
          </>
        )}
      >
        {!workspaceId && <p className="text-xs text-gray-500">Sign in to see and add photos (they are stored privately in the database).</p>}
        {workspaceId && !photos.length && <p className="text-xs text-gray-500">No photos yet.{canUpload ? " Add JPEG, PNG, WebP or GIF files (up to 25 MB each)." : ""}</p>}
        {photos.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
            <figure className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50" data-testid="cover-photo">
              {links[cover.path] ? <img src={links[cover.path]} alt={cover.caption || name} className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3] w-full animate-pulse bg-gray-100" />}
              <figcaption className="px-3 py-2 text-xs text-gray-600">
                <span className="mr-1.5 rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700">Cover</span>
                {cover.caption || cover.name}{cover.date ? ` · ${cover.date}` : ""}
              </figcaption>
            </figure>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="photo-list">
              {photos.map((p, i) => (
                <li key={p.id} className={`rounded-lg border p-2 ${p.id === cover.id ? "border-blue-300" : "border-gray-200"}`} data-testid="photo-item">
                  {links[p.path] ? <img src={links[p.path]} alt={p.caption || p.name} className="aspect-[4/3] w-full rounded object-cover" /> : <div className="aspect-[4/3] w-full rounded bg-gray-100" />}
                  {canEdit ? (
                    <>
                      <input type="text" defaultValue={p.caption} placeholder="Caption" aria-label="Caption"
                        onBlur={(e) => e.target.value !== p.caption && saveMedia((m) => updatePhoto(m, p.id, { caption: e.target.value }), [{ key: "assetMedia.photos", field: `Photo ${i + 1} caption`, from: p.caption, to: e.target.value }], "Asset photos")}
                        className="mt-1.5 w-full rounded border border-gray-200 px-1.5 py-1 text-xs" />
                      <input type="date" defaultValue={p.date} aria-label="Photo date"
                        onBlur={(e) => e.target.value !== p.date && saveMedia((m) => updatePhoto(m, p.id, { date: e.target.value }), [{ key: "assetMedia.photos", field: `Photo ${i + 1} date`, from: p.date, to: e.target.value }], "Asset photos")}
                        className="mt-1 w-full rounded border border-gray-200 px-1.5 py-1 text-xs" />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                        <button type="button" disabled={i === 0} onClick={() => saveMedia((m) => movePhoto(m, p.id, -1), [], "Asset photos")} className={`${btn} border-gray-300`} aria-label="Move earlier">←</button>
                        <button type="button" disabled={i === photos.length - 1} onClick={() => saveMedia((m) => movePhoto(m, p.id, 1), [], "Asset photos")} className={`${btn} border-gray-300`} aria-label="Move later">→</button>
                        <button type="button" disabled={p.id === cover.id} onClick={() => saveMedia((m) => setCover(m, p.id), [{ key: "assetMedia.photos", field: "Cover photo", from: cover.caption || cover.name, to: p.caption || p.name }], "Asset photos")} className={`${btn} border-gray-300`}>Make cover</button>
                        <button type="button" onClick={() => deletePhoto(p)} className={`${btn} border-red-200 text-red-600`}>Delete</button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] text-gray-600">{p.caption || p.name}{p.date ? ` · ${p.date}` : ""}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <LocationMap inputs={inputs} geo={media.geo} canEdit={canEdit} onSave={(geo, entries) => saveMedia((m) => ({ ...m, geo }), entries, "Asset location")} />

      <FloorPlan
        name={name}
        units={units}
        media={media}
        planUrl={media.floorPlan?.path ? links[media.floorPlan.path] : null}
        canEdit={canEdit}
        canUpload={canUpload}
        busy={busy}
        onUploadPlan={async (file) => {
          const bad = checkAssetFile(file);
          if (bad) { setMsg({ error: `${bad} Floor plans are images; save a PDF page as PNG or JPEG.` }); return; }
          setBusy(true); setMsg(null);
          try {
            const up = await uploadAssetFile(workspaceId, dealId, "floorplan", file);
            const old = media.floorPlan?.path;
            saveMedia((m) => setFloorPlan(m, { path: up.path, name: up.name, kind: "image" }), [{ key: "assetMedia.floorPlan", field: "Floor plan", from: media.floorPlan?.name ?? "", to: up.name }], "Floor plan");
            if (old) removeAssetFiles([old]).catch(() => {});
            setMsg({ ok: "Floor plan uploaded. Choose a unit and drag a box over it on the plan." });
          } catch (e) {
            setMsg({ error: e.message });
          } finally {
            setBusy(false);
          }
        }}
        planRef={planRef}
        onSetBox={(unitId, box, unitName) => saveMedia((m) => setBox(m, unitId, box), [{ key: "assetMedia.floorPlan", field: box ? `Unit ${unitName} placed on the floor plan` : `Unit ${unitName} removed from the floor plan`, from: "", to: box ? "placed" : "" }], "Floor plan")}
        onUnits={(nextUnits, nextMedia, entries, label) => onApplyDeal(dealId, (inp) => ({ ...inp, units: nextUnits, assetMedia: nextMedia(mediaOf(inp)) }), entries, label)}
        setMsg={setMsg}
      />

      <ActualNoiNote inputs={inputs} />
    </div>
  );
}

function ActualNoiNote({ inputs }) {
  const a = actualNoi(inputs, today());
  if (!a.months) return null;
  return (
    <p className="text-[11px] text-gray-500" data-testid="actual-noi-note">
      Actual NOI {a.months < 12 ? `(${a.months} months, annualized)` : "(trailing 12 months)"}: <span className="font-semibold text-gray-700">${fmt(a.noi)}</span>, {a.from} to {a.to}. Valuation and Sell/Hold Analysis show it next to the underwritten NOI.
    </p>
  );
}

function LocationMap({ inputs, geo, canEdit, onSave }) {
  const [state, setState] = useState(null);
  const [manual, setManual] = useState(null);
  const [view, setView] = useState("map");
  const q = mapQuery(inputs, geo);
  const handPoint = geo?.source === "manual";

  return (
    <Section
      title="Location"
      testId="asset-map"
      right={
        <div className="flex flex-wrap items-center gap-2">
          {q && (
            <div className="flex overflow-hidden rounded-lg border border-gray-300 text-xs" role="group" aria-label="Map view">
              {[["map", "Map"], ["satellite", "Satellite"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} className={`px-2.5 py-1 font-medium ${view === k ? "bg-gray-800 text-white" : "bg-white text-gray-700"}`}>{l}</button>
              ))}
            </div>
          )}
          {q && <a href={googleMapsLink(q)} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 hover:underline" data-testid="google-maps-link">Open in Google Maps</a>}
          {canEdit && <button type="button" onClick={() => setManual(manual ? null : { lat: geo?.lat ?? "", lon: geo?.lon ?? "" })} className={`${btn} border-gray-300 bg-white text-gray-700`}>{handPoint ? "Edit coordinates" : "Enter coordinates"}</button>}
          {canEdit && handPoint && (
            <button type="button" onClick={() => onSave(null, [{ key: "assetMedia.geo", field: "Map location", from: `${geo.lat}, ${geo.lon}`, to: "the address" }])} className={`${btn} border-gray-300 bg-white text-gray-700`}>Use the address</button>
          )}
        </div>
      }
    >
      <p className="mb-2 text-xs text-gray-600">
        {[inputs.address, inputs.city, inputs.state, inputs.zip].filter(Boolean).join(", ") || "No address in the Property inputs yet."}
        {handPoint && <span className="text-gray-400"> · map at {geo.lat}, {geo.lon} (entered by hand)</span>}
      </p>
      {manual && (
        <div className="mb-2 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col">Latitude<input type="number" step="0.000001" value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} className="w-36 rounded border border-gray-300 px-2 py-1" /></label>
          <label className="flex flex-col">Longitude<input type="number" step="0.000001" value={manual.lon} onChange={(e) => setManual({ ...manual, lon: e.target.value })} className="w-36 rounded border border-gray-300 px-2 py-1" /></label>
          <button type="button" className={`${btn} border-blue-600 bg-blue-600 text-white`} onClick={() => {
            const lat = Number(manual.lat), lon = Number(manual.lon);
            if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || manual.lat === "" || manual.lon === "") { setState({ error: "Latitude is −90 to 90 and longitude −180 to 180." }); return; }
            onSave({ lat, lon, label: "Entered by hand", query: "", source: "manual", at: new Date().toISOString() }, [{ key: "assetMedia.geo", field: "Map location", from: geo ? `${geo.lat}, ${geo.lon}` : "the address", to: `${lat}, ${lon} (entered)` }]);
            setManual(null); setState(null);
          }}>Save</button>
        </div>
      )}
      {state?.error && <p className="mb-2 text-xs text-red-600">{state.error}</p>}
      {q ? (
        <>
          <iframe title={`Map of ${inputs.propertyName || "the asset"}`} src={googleEmbedUrl(q, { view })} className="h-72 w-full rounded-lg border border-gray-200" loading="lazy" referrerPolicy="no-referrer-when-downgrade" data-testid="map-frame" />
          <p className="mt-1 text-[10px] text-gray-400">Map from Google Maps{GOOGLE_EMBED_KEY ? "" : " (keyless embed)"}, found from the {handPoint ? "coordinates entered" : "address"}. If the pin is off (for example a new street Google doesn&apos;t know), enter the coordinates.</p>
        </>
      ) : (
        <p className="text-xs text-gray-500">Add the address in the Property inputs (or enter coordinates) to show the map.</p>
      )}
    </Section>
  );
}

function FloorPlan({ name, units, media, planUrl, canEdit, canUpload, busy, onUploadPlan, planRef, onSetBox, onUnits, setMsg }) {
  const asOf = today();
  const [placing, setPlacing] = useState("");
  const [drag, setDrag] = useState(null);
  const [picked, setPicked] = useState([]);
  const [parts, setParts] = useState("");
  const svgRef = useRef(null);
  const hasPlan = !!media.floorPlan?.path;
  const boxes = hasPlan ? Object.entries(media.floorPlan?.boxes ?? {}).map(([unitId, b]) => ({ unitId, ...b })) : schematicLayout(units);
  const byId = new Map(units.map((u) => [u.id, u]));
  const unplaced = hasPlan ? units.filter((u) => !media.floorPlan?.boxes?.[u.id]) : [];

  const frac = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickedUnits = picked.map((id) => byId.get(id)).filter(Boolean);

  function combine() {
    const r = combineUnits(units, picked);
    if (r.error) { setMsg({ error: r.error }); return; }
    const names = pickedUnits.map((u) => u.name ?? u.id).join(", ");
    onUnits(r.units, (m) => boxesAfterCombine(m, picked, r.id), [{ key: "units", field: "Units combined", from: names, to: r.units.find((u) => u.id === r.id).name }], "Combine units");
    setPicked([]);
    setMsg({ ok: `Combined ${names}.` });
  }
  function demise() {
    const u = pickedUnits[0];
    const ps = parts.split(/[,\s]+/).filter(Boolean).map((x) => Number(x.replace(/[^\d.]/g, "")));
    const r = demiseUnit(units, u.id, ps);
    if (r.error) { setMsg({ error: r.error }); return; }
    const made = r.units.filter((x) => r.ids.includes(x.id));
    onUnits(r.units, (m) => boxesAfterDemise(m, u.id, made), [{ key: "units", field: "Unit demised", from: `${u.name ?? u.id} (${fmt(u.squareFeet)} SF)`, to: made.map((x) => `${x.name} (${fmt(x.squareFeet)} SF)`).join(", ") }], "Demise unit");
    setPicked([]); setParts("");
    setMsg({ ok: `Demised ${u.name ?? u.id} into ${made.length} units.` });
  }

  return (
    <Section
      title="Floor plan"
      testId="floor-plan"
      right={canUpload && (
        <>
          <input ref={planRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Upload floor plan" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadPlan(f); e.target.value = ""; }} />
          <button type="button" disabled={busy} className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => planRef.current?.click()}>{hasPlan ? "Replace plan" : "Upload plan"}</button>
        </>
      )}
    >
      {!units.length ? (
        <p className="text-xs text-gray-500">No rent roll units for {name}. Add units on the Unit Roll to see them here.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            {Object.entries(STATUS_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border" style={{ background: c.fill, borderColor: c.stroke }} />{c.label}</span>
            ))}
            {!hasPlan && <span className="text-gray-400">Schematic: units in rent roll order, width by SF. Upload a plan to draw them where they are.</span>}
          </div>
          {hasPlan && canEdit && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">Place unit
                <select value={placing} onChange={(e) => setPlacing(e.target.value)} aria-label="Unit to place" className="rounded border border-gray-300 px-1.5 py-1">
                  <option value="">Choose…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.id}{media.floorPlan?.boxes?.[u.id] ? " (placed)" : ""}</option>)}
                </select>
              </label>
              {placing && <span className="text-gray-500">Drag a box over the unit on the plan.</span>}
              {placing && media.floorPlan?.boxes?.[placing] && <button type="button" className={`${btn} border-gray-300`} onClick={() => onSetBox(placing, null, byId.get(placing)?.name ?? placing)}>Remove box</button>}
              {unplaced.length > 0 && <span className="text-amber-700">{unplaced.length} unit{unplaced.length === 1 ? "" : "s"} not placed yet</span>}
            </div>
          )}
          <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50" style={hasPlan ? undefined : { aspectRatio: "3 / 1" }}>
            {hasPlan && (planUrl ? <img src={planUrl} alt={`Floor plan of ${name}`} className="block w-full select-none" draggable={false} /> : <div className="aspect-[3/1] w-full animate-pulse bg-gray-100" />)}
            <svg
              ref={svgRef}
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className={`absolute inset-0 h-full w-full ${placing ? "cursor-crosshair" : ""}`}
              data-testid="floor-plan-svg"
              onPointerDown={(e) => { if (!placing) return; e.currentTarget.setPointerCapture?.(e.pointerId); const p = frac(e); setDrag({ x: p.x, y: p.y, w: 0, h: 0 }); }}
              onPointerMove={(e) => { if (!drag) return; const p = frac(e); setDrag((d) => ({ ...d, w: p.x - d.x, h: p.y - d.y })); }}
              onPointerUp={() => {
                if (drag && placing && Math.abs(drag.w) > 0.01 && Math.abs(drag.h) > 0.01) onSetBox(placing, drag, byId.get(placing)?.name ?? placing);
                setDrag(null);
              }}
            >
              {boxes.map((b) => {
                const u = byId.get(b.unitId);
                if (!u) return null;
                const c = STATUS_COLORS[unitStatus(u, asOf)];
                const sel = picked.includes(u.id);
                return (
                  <g key={b.unitId} data-testid="unit-box" data-status={unitStatus(u, asOf)} onClick={() => canEdit && !placing && toggle(u.id)} className={canEdit && !placing ? "cursor-pointer" : ""}>
                    <title>{`${u.name ?? u.id} · ${fmt(u.squareFeet)} SF · ${u.leaseStatus === "occupied" ? `${u.tenantName || "Leased"}${u.leaseEnd ? `, to ${u.leaseEnd}` : ""}` : "Vacant"}`}</title>
                    <rect x={b.x * 1000} y={b.y * 1000} width={b.w * 1000} height={b.h * 1000} fill={c.fill} fillOpacity={hasPlan ? 0.6 : 1} stroke={sel ? "#2563eb" : c.stroke} strokeWidth={sel ? 8 : 3} vectorEffect="non-scaling-stroke" />
                    <text x={(b.x + b.w / 2) * 1000} y={(b.y + b.h / 2) * 1000} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(14, Math.min(40, b.w * 300))} fill="#111827" style={{ pointerEvents: "none" }}>{u.name ?? u.id}</text>
                  </g>
                );
              })}
              {drag && <rect x={Math.min(drag.x, drag.x + drag.w) * 1000} y={Math.min(drag.y, drag.y + drag.h) * 1000} width={Math.abs(drag.w) * 1000} height={Math.abs(drag.h) * 1000} fill="#3b82f6" fillOpacity={0.2} stroke="#2563eb" strokeDasharray="6 4" />}
            </svg>
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" data-testid="demise-combine">
              <span className="text-gray-600">{picked.length ? `Selected: ${pickedUnits.map((u) => `${u.name ?? u.id} (${fmt(u.squareFeet)} SF${u.leaseStatus === "occupied" ? ", leased" : ""})`).join(", ")}` : "Click units on the plan to select them."}</span>
              {picked.length >= 2 && <button type="button" onClick={combine} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Combine {picked.length} units</button>}
              {picked.length === 1 && (
                <>
                  <input value={parts} onChange={(e) => setParts(e.target.value)} placeholder={`e.g. ${fmt(pickedUnits[0].squareFeet / 2)}, ${fmt(pickedUnits[0].squareFeet / 2)}`} aria-label="New unit sizes (SF)" className="w-48 rounded border border-gray-300 px-2 py-1" />
                  <button type="button" disabled={!parts.trim()} onClick={demise} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Demise</button>
                </>
              )}
              {picked.length > 0 && <button type="button" onClick={() => setPicked([])} className={`${btn} border-gray-300`}>Clear</button>}
              <span className="w-full text-[10px] text-gray-400">Only vacant units can be demised or combined. New units are vacant at the unit&apos;s market rent; the rent roll, cash flow and Unit Roll update, and each change is in the change log.</span>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
