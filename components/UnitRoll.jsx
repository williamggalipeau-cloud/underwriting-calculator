"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { downloadBlob } from "@/lib/fundTerms";
import { SIC_CODES, sicLabel, sicTitle, suggestSic } from "@/lib/sicCodes";
import { LEASE_FIELDS, leaseAnalytics, leaseEndOf, monthsRemainingFor, parseRentRollRows, rentRollRows, todayISO } from "@/lib/leases";
import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";
import { leaseMismatches, showValue } from "@/lib/leaseApply";
import { listLeases } from "@/lib/leaseDocs";

// ─── CSV / Excel import ──────────────────────────────────────────────────────

// Splits CSV text into rows (handles double-quoted fields with commas).
function csvRows(text) {
  return text.split(/\r?\n/).map((line) => {
    const out = [];
    let field = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { field += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        out.push(field); field = "";
      } else {
        field += ch;
      }
    }
    out.push(field);
    return out.map((f) => f.trim());
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function newUnit(name, squareFeet, inputs, occupied = true, monthsRemaining = 0) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    squareFeet,
    tenantName: "",
    businessDescription: "",
    creditRating: "",
    naicsCode: "",
    sicCode: "",
    leaseStatus: occupied ? "occupied" : "vacant",
    currentRentPSF: inputs.rentPerSF,
    monthsRemaining: occupied ? Math.max(1, monthsRemaining) : 0,
    newLeaseTerm: Math.round(inputs.avgLeaseTerm * 12),
    renewalProbabilityPct: inputs.renewalProbabilityPct,
    downtimeBetweenLeases: inputs.downtimeBetweenLeases ?? 2,
    creditLossPct: inputs.creditLossPct ?? 1,
    freeRentMonthsNew: inputs.freeRentMonthsNew ?? 1,
    freeRentMonthsRenewal: inputs.freeRentMonthsRenewal ?? 0,
    tiConcessionPSFNew: inputs.tiConcessionPSFNew ?? 0,
    tiConcessionPSFRenewal: inputs.tiConcessionPSFRenewal ?? 0,
    tiNewPSF: inputs.tiPerSFNew ?? 8,
    tiRenewalPSF: inputs.tiPerSFRenewal,
    leaseType: inputs.leaseType,
    otherIncomePSF: inputs.otherIncomePSF ?? 0,
    annualEscalationPct: inputs.annualRentEscalationPct,
    realEstateTaxPSF: inputs.realEstateTaxPSF,
    insurancePSF: inputs.insurancePSF,
    utilitiesPSF: inputs.utilitiesPSF,
    maintenancePSF: inputs.maintenancePSF,
    janitorialPSF: inputs.janitorialPSF,
    leasingCommissionNewPct: inputs.leasingCommissionNewPct,
    leasingCommissionRenewalPct: inputs.leasingCommissionRenewalPct,
  };
}

export function generateUnits(inputs) {
  const { squareFootage, unitCount, vacancyPct, rentPerSF, avgLeaseTerm } = inputs;
  if (unitCount <= 0) return [];

  const sfPerUnit  = Math.round(squareFootage / unitCount);
  const occupiedN  = Math.round(unitCount * (1 - vacancyPct / 100));
  const maxExpiry  = Math.round(avgLeaseTerm * 12);

  return Array.from({ length: unitCount }, (_, i) => {
    const name        = String(i + 1).padStart(3, "0");
    const isOccupied  = i < occupiedN;
    const moRemaining = isOccupied
      ? Math.max(1, Math.round(((i + 1) / occupiedN) * maxExpiry))
      : 0;
    const rentVariation = rentPerSF * (1 + ((i % 7) - 3) * 0.025);
    const rent          = Math.round(rentVariation * 4) / 4;

    const unit = newUnit(name, sfPerUnit, inputs, isOccupied, moRemaining);
    if (isOccupied) unit.currentRentPSF = Math.max(0.5, rent);
    return unit;
  });
}

// ─── Editable cell ────────────────────────────────────────────────────────────

function NumCell({ value, onChange, step = 1, min = 0, label, prefix, suffix }) {
  return (
    <div className="flex items-center border border-transparent rounded focus-within:border-blue-400 focus-within:bg-blue-50 overflow-hidden">
      {prefix && <span className="text-gray-400 text-xs pl-1">{prefix}</span>}
      <input
        type="number"
        aria-label={label}
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-1 py-1 text-xs text-gray-900 bg-transparent outline-none text-right tabular-nums"
      />
      {suffix && <span className="text-gray-400 text-xs pr-1">{suffix}</span>}
    </div>
  );
}

function TextCell({ value, onChange, placeholder, label }) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-1 py-1 text-xs text-gray-900 bg-transparent outline-none border border-transparent rounded focus:border-blue-400 focus:bg-blue-50"
    />
  );
}

// ─── Summary stats ────────────────────────────────────────────────────────────

const money = (v) => (isFinite(v) ? `$${Math.round(v).toLocaleString()}` : "—");
const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC" }) : "—");

function SummaryStats({ units, inputs, la }) {
  if (units.length === 0) return null;
  const propertySF = inputs.squareFootage;
  const totalUnitSF  = units.reduce((s, u) => s + u.squareFeet, 0);
  const occupied     = units.filter((u) => u.leaseStatus === "occupied");
  const occupiedSF   = occupied.reduce((s, u) => s + u.squareFeet, 0);
  const occupancyPct = totalUnitSF > 0 ? (occupiedSF / totalUnitSF) * 100 : 0;
  const sfMismatch   = Math.abs(totalUnitSF - propertySF) > 1;
  const mtm = la.markToMarketPct;

  const stats = [
    { label: "Units",     value: `${units.length}`, tip: "" },
    { label: "Leased",    value: `${occupied.length} of ${units.length}`, tip: "" },
    { label: "Total SF",  value: totalUnitSF.toLocaleString(), tip: "" },
    { label: "Occupancy", value: `${occupancyPct.toFixed(0)}%`, tip: "Leased SF ÷ total SF" },
    { label: "WALT",      value: isFinite(la.walt) ? `${la.walt.toFixed(1)} yrs` : "—", tip: "Weighted average lease term remaining from today, weighted by annual rent" },
    { label: "In-place rent", value: isFinite(la.inPlaceRentPSF) ? `$${la.inPlaceRentPSF.toFixed(2)}/SF` : "—", tip: "Annual contract rent ÷ leased SF" },
    { label: "Market rent", value: `$${(inputs.rentPerSF ?? 0).toFixed(2)}/SF`, tip: "Market rent from the deal inputs" },
    { label: "Mark to market", value: isFinite(mtm) ? `${mtm >= 0 ? "+" : ""}${mtm.toFixed(1)}%` : "—", tip: "How far market rent is above (+) or below (−) in-place rent" },
    { label: "Rolling 12 mo", value: `${la.rolloverPct.toFixed(0)}% of rent`, tip: "Share of annual rent in leases ending within 12 months" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {stats.map(({ label, value, tip }) => (
          <div key={label} title={tip} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
      {sfMismatch && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Unit roster SF ({totalUnitSF.toLocaleString()}) differs from property SF ({propertySF.toLocaleString()}). Adjust unit SF or property SF to match.
        </p>
      )}
    </div>
  );
}

// Expirations by year and upcoming critical dates.
function LeaseSummary({ la }) {
  if (!la.leases) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white">
        <h3 className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">Lease expirations by year</h3>
        <table className="w-full text-xs tabular-nums">
          <thead className="text-gray-500">
            <tr>{["Year", "Leases", "SF", "Annual rent", "% of rent", "Cumulative"].map((h) => <th key={h} className={`px-3 py-1.5 font-medium ${h === "Year" ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {la.expirations.map((e) => (
              <tr key={e.year} className="border-t border-gray-100 text-gray-800">
                <td className="px-3 py-1.5">{e.year}</td>
                <td className="px-3 py-1.5 text-right">{e.leases}</td>
                <td className="px-3 py-1.5 text-right">{e.sf.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">{money(e.annualRent)}</td>
                <td className="px-3 py-1.5 text-right">{e.pctRent.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{e.cumPctRent.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-1.5 text-[11px] text-gray-400">Leases already past their end date (holdover) are shown in the current year.</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white">
        <h3 className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">Critical dates, next 12 months</h3>
        {la.criticalDates.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-400">None. Add lease end dates, renewal options and termination rights in each unit&apos;s Lease details.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {la.criticalDates.map((d, i) => (
                <tr key={i} className={`border-t border-gray-100 first:border-t-0 align-top ${d.days < 0 ? "bg-red-50/60" : d.days <= 90 ? "bg-amber-50/60" : ""}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-gray-800">{fmtDate(d.date)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{d.days < 0 ? `${-d.days} days ago` : `in ${d.days} days`}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-900">{d.kind}</td>
                  <td className="px-3 py-1.5 text-gray-700">Unit {d.unit}{d.tenant ? ` · ${d.tenant}` : ""}<span className="block text-gray-400">{d.detail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Leased SF by tenant industry (SIC code).
function IndustryMix({ la }) {
  if (!la.leases || !la.industryMix?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <h3 className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">Tenant industries (SIC)</h3>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-gray-500">
          <tr>{["SIC", "Industry", "Leases", "SF", "% of leased SF", "Annual rent"].map((h) => <th key={h} className={`px-3 py-1.5 font-medium ${h === "SIC" || h === "Industry" ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {la.industryMix.map((e) => (
            <tr key={e.sicCode} className="border-t border-gray-100 text-gray-800">
              <td className="px-3 py-1.5">{e.sicCode}</td>
              <td className="px-3 py-1.5 text-gray-600">{e.title || "—"}</td>
              <td className="px-3 py-1.5 text-right">{e.leases}</td>
              <td className="px-3 py-1.5 text-right">{e.sf.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{e.pctSF.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right">{money(e.annualRent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Lease details form for one unit.
function LeaseDetails({ unit, inputs, onField }) {
  const derivedEnd = leaseEndOf(unit, inputs);
  const input = "w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-400 focus:outline-none";
  const steps = Array.isArray(unit.rentSteps) ? unit.rentSteps : [];
  return (
    <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.length > 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 px-2 py-1.5 text-[11px] text-violet-900 sm:col-span-2 lg:col-span-4" data-testid="rent-steps">
          <span className="font-medium">Rent steps from the lease</span> (drive the cash flow while this lease runs; $/SF/yr):{" "}
          {steps.map((st) => `${st.start} $${Number(st.rentPSF).toFixed(2)}`).join(" · ")}
          <button type="button" onClick={() => onField("rentSteps", undefined)} className="ml-2 text-violet-600 underline hover:text-violet-800">Remove steps</button>
        </div>
      )}
      {LEASE_FIELDS.map((f) => {
        const v = unit[f.key] ?? "";
        const shown = f.key === "leaseEnd" && !v && derivedEnd ? derivedEnd : v;
        return (
          <label key={f.key} className={`flex flex-col gap-0.5 ${f.key === "leaseNotes" || f.key === "otherRights" ? "sm:col-span-2" : ""}`}>
            <span className="text-[11px] font-medium text-gray-500">{f.label}{f.help ? <span className="font-normal text-gray-400"> · {f.help}</span> : null}</span>
            <input
              type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
              value={shown}
              step={f.type === "money" ? 100 : 1}
              min={f.type === "text" || f.type === "date" ? undefined : 0}
              onChange={(e) => {
                const raw = e.target.value;
                onField(f.key, f.type === "number" || f.type === "money" ? (raw === "" ? "" : Math.max(0, Number(raw))) : raw);
              }}
              className={`${input} ${f.key === "leaseEnd" && !v ? "text-gray-400" : ""}`}
            />
          </label>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const COL_HEADERS = [
  { key: "name",      label: "Unit",      width: "w-16", tip: "" },
  { key: "sf",        label: "SF",        width: "w-20", tip: "" },
  { key: "tenant",    label: "Tenant",    width: "w-28", tip: "" },
  { key: "bizDesc",   label: "Business",  width: "w-36", tip: "Business description or tenant use type" },
  { key: "credit",    label: "Credit",    width: "w-20", tip: "Tenant credit rating (e.g. A, BB+, Investment Grade)" },
  { key: "sic",       label: "SIC",       width: "w-24", tip: "SIC industry code (4 digits). Suggested from the business description; pick from the list or type a code" },
  { key: "naics",     label: "NAICS",     width: "w-20", tip: "NAICS industry code (optional)" },
  { key: "status",    label: "Status",    width: "w-24", tip: "" },
  { key: "leaseType", label: "Lease",     width: "w-28", tip: "Lease type — determines landlord expense responsibility" },
  { key: "rent",      label: "Rent $/SF", width: "w-20", tip: "Contracted rent ($/SF/yr)" },
  { key: "otherInc",  label: "Oth Inc",   width: "w-16", tip: "Other income ($/SF/yr)" },
  { key: "esc",       label: "Esc %",     width: "w-16", tip: "In-lease annual rent escalation (% per year during lease term)" },
  { key: "mktSpread", label: "Mkt Δ",     width: "w-16", tip: "Contracted rent vs. current market rent ($/SF)" },
  { key: "reTax",     label: "RE Tax",    width: "w-16", tip: "Real estate tax ($/SF/yr) — dimmed when tenant-paid" },
  { key: "ins",       label: "Ins",       width: "w-16", tip: "Insurance ($/SF/yr) — dimmed when tenant-paid" },
  { key: "utils",     label: "Utils",     width: "w-16", tip: "Utilities ($/SF/yr) — dimmed when tenant-paid" },
  { key: "maint",     label: "Maint",     width: "w-16", tip: "Maintenance ($/SF/yr) — dimmed when tenant-paid" },
  { key: "janit",     label: "Janit",     width: "w-16", tip: "Janitorial ($/SF/yr) — dimmed when tenant-paid" },
  { key: "moLeft",    label: "Mo. Left",  width: "w-16", tip: "Months remaining on current lease, from the analysis start (acquisition date)" },
  { key: "leaseEnd",  label: "Lease End", width: "w-28", tip: "Lease end date. Entering it sets months remaining; grey means calculated from months remaining" },
  { key: "newTerm",   label: "New Term",  width: "w-16", tip: "Months for next lease" },
  { key: "renew",     label: "Renew %",   width: "w-16", tip: "Renewal probability" },
  { key: "downtime",  label: "Downtime",  width: "w-16", tip: "Vacancy months between leases" },
  { key: "tiNew",     label: "TI New",    width: "w-16", tip: "TI for new tenants ($/SF)" },
  { key: "tiRen",     label: "TI Ren",    width: "w-16", tip: "TI for renewals ($/SF)" },
  { key: "lcNew",     label: "LC New",    width: "w-16", tip: "Leasing commission — new lease (% of lease value)" },
  { key: "lcRen",     label: "LC Ren",    width: "w-16", tip: "Leasing commission — renewal (% of lease value)" },
  { key: "credLoss",  label: "Cr Loss",   width: "w-16", tip: "Credit loss / bad debt (% of EGR)" },
  { key: "frNew",     label: "FR New",    width: "w-16", tip: "Free rent months granted to new tenants" },
  { key: "frRen",     label: "FR Ren",    width: "w-16", tip: "Free rent months granted on renewals" },
  { key: "tiConcN",   label: "TI Conc N", width: "w-20", tip: "TI concession $/SF — new lease (income-side deduction)" },
  { key: "tiConcR",   label: "TI Conc R", width: "w-20", tip: "TI concession $/SF — renewal (income-side deduction)" },
];

export default function UnitRoll({ units, inputs, onChange, workspaceId, dealId }) {
  const headerId  = useId();
  const fileInput = useRef(null);
  const [csvError, setCsvError] = useState(null);
  // Abstracted leases for this asset (signed in with a workspace): rows whose
  // unit differs from its lease abstract are flagged.
  const [leases, setLeases] = useState([]);
  useEffect(() => {
    // Loads this asset's leases; nothing to load without a workspace.
    if (!workspaceId || !dealId) return;
    let alive = true;
    listLeases(workspaceId)
      .then((list) => alive && setLeases(list.filter((l) => l.deal_id === dealId && l.abstract)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspaceId, dealId]);
  const leaseFlag = (u) => {
    if (!workspaceId) return null;
    const l = leases.find((x) => x.deal_id === dealId && (x.unit_ids ?? []).includes(u.id));
    if (!l) return null;
    return { lease: l, diffs: leaseMismatches(l.abstract, u, inputs) };
  };

  // Editing the business fills the SIC code when it is blank or still the
  // code suggested for the previous business.
  const update = (id, field, value) =>
    onChange(units.map((u) => {
      if (u.id !== id) return u;
      const next = { ...u, [field]: value };
      if (field === "businessDescription") {
        const old = String(u.sicCode ?? "").trim();
        if (!old || old === suggestSic(u.businessDescription)) next.sicCode = suggestSic(value) || old;
      }
      return next;
    }));

  const addUnit = () => {
    const sfRemaining = inputs.squareFootage - units.reduce((s, u) => s + u.squareFeet, 0);
    const suggestedSF = Math.max(500, inputs.unitCount > 0
      ? Math.round(inputs.squareFootage / inputs.unitCount)
      : 3000);
    const name = `${units.length + 1}`.padStart(3, "0");
    onChange([...units, newUnit(name, Math.max(500, sfRemaining > 0 ? Math.min(suggestedSF, sfRemaining) : suggestedSF), inputs, false, 0)]);
  };

  const removeUnit = (id) => onChange(units.filter((u) => u.id !== id));
  const generate   = () => onChange(generateUnits(inputs));

  // New units from an imported file start from the deal's defaults.
  const importDefaults = (i) => ({
    ...newUnit(String(i + 1).padStart(3, "0"), 0, inputs, true, 12),
    id: `imp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
  });

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
    try {
      const rows = /\.xlsx$/i.test(file.name) ? await readXlsxGrid(await file.arrayBuffer()) : csvRows(await file.text());
      const imported = parseRentRollRows(rows, importDefaults, inputs);
      if (units.length && !window.confirm(`Replace the ${units.length} units in this rent roll with ${imported.length} units from ${file.name}?`)) return;
      setCsvError(null);
      onChange(imported);
    } catch (err) {
      setCsvError(err.message);
    }
  };

  const downloadRentRoll = async () => {
    const rows = rentRollRows(units);
    const name = (inputs.propertyName || "rent-roll").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
    downloadBlob(
      await writeXlsx(rows, { sheetName: "Rent roll", colWidths: rows[0].map((h) => Math.max(10, Math.min(24, h.length + 2))) }),
      units.length ? `${name}-rent-roll.xlsx` : "rent-roll-template.xlsx"
    );
  };

  const la = leaseAnalytics({ ...inputs, units }, todayISO());
  const [openId, setOpenId] = useState(null);
  const setLeaseField = (u, key, value) => {
    const next = { ...u, [key]: value };
    if (key === "leaseEnd") {
      const mo = monthsRemainingFor(inputs, value);
      if (mo != null && u.leaseStatus === "occupied") next.monthsRemaining = Math.max(1, mo);
    }
    onChange(units.map((x) => (x.id === u.id ? next : x)));
  };

  const totalUnitSF = units.reduce((s, u) => s + u.squareFeet, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Unit Lease Roll</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {units.length === 0
              ? "No units — model uses portfolio-level vacancy & rollover assumptions"
              : `${units.length} units · ${totalUnitSF.toLocaleString()} SF modeled individually`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleImport}
            className="sr-only"
            aria-label="Import rent roll (CSV or Excel)"
          />
          {units.length === 0 ? (
            <>
              <button
                type="button"
                onClick={generate}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Generate from settings
              </button>
              <button
                type="button"
                onClick={() => { setCsvError(null); fileInput.current?.click(); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Import CSV / Excel
              </button>
              <button type="button" onClick={downloadRentRoll} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Download template
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={generate} className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => { setCsvError(null); fileInput.current?.click(); }}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Import CSV / Excel
              </button>
              <button type="button" onClick={downloadRentRoll} className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Download Excel
              </button>
              <button type="button" onClick={() => onChange([])} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                Clear all
              </button>
              <button type="button" onClick={addUnit} className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                + Add unit
              </button>
            </>
          )}
        </div>
      </div>

      {/* CSV error */}
      {csvError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
          <span className="font-semibold shrink-0">Import error:</span>
          <span>{csvError}</span>
          <button type="button" onClick={() => setCsvError(null)} className="ml-auto text-red-400 hover:text-red-600 text-base leading-none shrink-0">×</button>
        </div>
      )}

      {/* Summary stats */}
      <SummaryStats units={units} inputs={inputs} la={la} />
      <LeaseSummary la={la} />
      <IndustryMix la={la} />
      <datalist id="sic-codes">
        {SIC_CODES.map(([code, title]) => <option key={code} value={code}>{`${code} — ${title}`}</option>)}
      </datalist>

      {/* Empty state */}
      {units.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-gray-500">No unit lease roll defined</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Generate a roster from your deal settings, or import a rent roll (CSV or Excel; download the template for the columns).
            <br />When units are present, the model uses actual lease schedules instead of portfolio-level vacancy.
          </p>
          <p className="text-xs text-gray-300 mb-4 max-w-lg mx-auto">
            Only SF is required. Other columns include unit, tenant, status, lease type, rent $/SF, lease start and end dates, renewal options and notice, termination rights, security deposit and guarantor.
          </p>
          <button
            type="button"
            onClick={generate}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            Generate from settings ({inputs.unitCount} units)
          </button>
        </div>
      )}

      {/* Lease roll table */}
      {units.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="text-xs w-full border-collapse" aria-labelledby={headerId}>
            <caption id={headerId} className="sr-only">Unit lease roll</caption>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-6 px-2 py-2" title="Lease details" />
                {COL_HEADERS.map((h) => (
                  <th key={h.key} title={h.tip} className={`${h.width} px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap`}>
                    {h.label}
                  </th>
                ))}
                <th className="w-8 px-2 py-2" />
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map((u) => {
                const isOccupied   = u.leaseStatus === "occupied";
                const annualRevenue = isOccupied ? u.currentRentPSF * u.squareFeet : 0;
                const unitLease    = u.leaseType ?? inputs.leaseType ?? "NNN";

                const isOpen = openId === u.id;
                return (
                  <Fragment key={u.id}>
                  <tr className={`hover:bg-gray-50 transition-colors ${!isOccupied ? "bg-red-50/30" : ""} ${isOpen ? "bg-blue-50/40" : ""}`}>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`Lease details for unit ${u.name}`}
                        title="Lease details"
                        onClick={() => setOpenId(isOpen ? null : u.id)}
                        className="rounded px-1 text-gray-400 hover:bg-blue-100 hover:text-blue-700"
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <TextCell label="Unit name" value={u.name} onChange={(v) => update(u.id, "name", v)} />
                      {(() => {
                        const f = leaseFlag(u);
                        if (!f) return null;
                        return f.diffs.length ? (
                          <span
                            className="mt-0.5 block whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800"
                            title={`Differs from the lease abstract (${f.lease.tenant || "lease"}):\n${f.diffs.map((d) => `${d.label}: rent roll ${showValue(d.kind, d.unitValue)}, lease ${showValue(d.kind, d.abstractValue)}`).join("\n")}\nApply or review it on the Leases tab.`}
                            data-testid="unit-lease-flag"
                          >
                            ⚠ {f.diffs.length} vs lease
                          </span>
                        ) : (
                          <span className="mt-0.5 block whitespace-nowrap text-[10px] text-emerald-700" title="Matches its lease abstract" data-testid="unit-lease-flag">✓ lease</span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Square feet" value={u.squareFeet} step={100} onChange={(v) => update(u.id, "squareFeet", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextCell label="Tenant name" value={u.tenantName} placeholder={isOccupied ? "Tenant" : "Vacant"} onChange={(v) => update(u.id, "tenantName", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextCell label="Business description" value={u.businessDescription ?? ""} placeholder="e.g. Light mfg." onChange={(v) => update(u.id, "businessDescription", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextCell label="Credit rating" value={u.creditRating ?? ""} placeholder="e.g. A" onChange={(v) => update(u.id, "creditRating", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        list="sic-codes"
                        inputMode="numeric"
                        aria-label="SIC code"
                        value={u.sicCode ?? ""}
                        placeholder={suggestSic(u.businessDescription) || "e.g. 3444"}
                        title={sicLabel(u.sicCode) || "SIC code"}
                        onChange={(e) => update(u.id, "sicCode", e.target.value.replace(/\s+—.*$/, "").trim())}
                        className="w-full bg-transparent text-sm text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-0.5"
                      />
                      {u.sicCode && sicTitle(u.sicCode) ? <span className="block max-w-[9rem] truncate text-[10px] leading-tight text-gray-400">{sicTitle(u.sicCode)}</span> : null}
                    </td>
                    <td className="px-2 py-1.5">
                      <TextCell label="NAICS code" value={u.naicsCode ?? ""} placeholder="e.g. 332322" onChange={(v) => update(u.id, "naicsCode", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => update(u.id, "leaseStatus", isOccupied ? "vacant" : "occupied")}
                        className={`px-2 py-1 rounded-full text-xs font-semibold transition-colors ${isOccupied ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                      >
                        {isOccupied ? "Occupied" : "Vacant"}
                      </button>
                    </td>
                    {/* Lease type — compact 3-way toggle */}
                    <td className="px-2 py-1.5">
                      <div className="flex gap-0.5">
                        {["NNN", "MG", "Gross"].map((lt) => (
                          <button
                            key={lt}
                            type="button"
                            onClick={() => update(u.id, "leaseType", lt)}
                            className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                              unitLease === lt
                                ? "bg-blue-600 text-white"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            {lt}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className={`px-2 py-1.5 ${!isOccupied ? "opacity-30 pointer-events-none" : ""}`}>
                      <NumCell label="Rent per SF" value={u.currentRentPSF} step={0.25} prefix="$" onChange={(v) => update(u.id, "currentRentPSF", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Other income per SF" value={u.otherIncomePSF ?? 0} step={0.05} prefix="$" onChange={(v) => update(u.id, "otherIncomePSF", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="In-lease escalation %" value={u.annualEscalationPct ?? inputs.annualRentEscalationPct} step={0.5} suffix="%" onChange={(v) => update(u.id, "annualEscalationPct", v)} />
                    </td>
                    {/* Mark-to-market spread: contracted vs current market rent */}
                    <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${!isOccupied ? "text-gray-300" : ""}`}>
                      {isOccupied ? (() => {
                        const spread = u.currentRentPSF - inputs.rentPerSF;
                        const color = spread > 0.25 ? "text-emerald-600" : spread < -0.25 ? "text-red-500" : "text-gray-400";
                        return (
                          <span className={`text-xs font-medium ${color}`}>
                            {spread >= 0 ? "+" : ""}{spread.toFixed(2)}
                          </span>
                        );
                      })() : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    {/* Operating expenses — dimmed when tenant-paid for this unit's lease type */}
                    {[
                      { field: "realEstateTaxPSF", propField: "realEstateTaxPSF", landlordPaid: unitLease === "MG" || unitLease === "Gross", label: "RE Tax $/SF" },
                      { field: "insurancePSF",     propField: "insurancePSF",     landlordPaid: unitLease === "MG" || unitLease === "Gross", label: "Insurance $/SF" },
                      { field: "utilitiesPSF",     propField: "utilitiesPSF",     landlordPaid: unitLease === "Gross", label: "Utilities $/SF" },
                      { field: "maintenancePSF",   propField: "maintenancePSF",   landlordPaid: unitLease === "Gross", label: "Maintenance $/SF" },
                      { field: "janitorialPSF",    propField: "janitorialPSF",    landlordPaid: unitLease === "Gross", label: "Janitorial $/SF" },
                    ].map(({ field, propField, landlordPaid, label }) => (
                      <td key={field} className={`px-2 py-1.5 ${!landlordPaid ? "opacity-30" : ""}`}>
                        <NumCell
                          label={label}
                          value={u[field] ?? inputs[propField] ?? 0}
                          step={0.05}
                          prefix="$"
                          onChange={(v) => update(u.id, field, v)}
                        />
                      </td>
                    ))}
                    <td className={`px-2 py-1.5 ${!isOccupied ? "opacity-30 pointer-events-none" : ""}`}>
                      <NumCell label="Months remaining" value={u.monthsRemaining} step={1} suffix="mo" onChange={(v) => onChange(units.map((x) => (x.id === u.id ? { ...x, monthsRemaining: v, leaseEnd: "" } : x)))} />
                    </td>
                    <td className={`px-2 py-1.5 ${!isOccupied ? "opacity-30 pointer-events-none" : ""}`}>
                      <input
                        type="date"
                        aria-label="Lease end date"
                        value={isOccupied ? u.leaseEnd || leaseEndOf(u, inputs) || "" : ""}
                        onChange={(e) => setLeaseField(u, "leaseEnd", e.target.value)}
                        className={`w-full px-1 py-1 text-xs bg-transparent outline-none border border-transparent rounded focus:border-blue-400 focus:bg-blue-50 ${u.leaseEnd ? "text-gray-900" : "text-gray-400"}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="New lease term" value={u.newLeaseTerm} step={6} suffix="mo" onChange={(v) => update(u.id, "newLeaseTerm", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Renewal probability" value={u.renewalProbabilityPct} step={5} suffix="%" onChange={(v) => update(u.id, "renewalProbabilityPct", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Downtime between leases" value={u.downtimeBetweenLeases ?? inputs.downtimeBetweenLeases ?? 2} step={1} suffix="mo" onChange={(v) => update(u.id, "downtimeBetweenLeases", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="TI for new lease" value={u.tiNewPSF} step={0.5} prefix="$" onChange={(v) => update(u.id, "tiNewPSF", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="TI for renewal" value={u.tiRenewalPSF} step={0.5} prefix="$" onChange={(v) => update(u.id, "tiRenewalPSF", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="LC new lease %" value={u.leasingCommissionNewPct ?? inputs.leasingCommissionNewPct} step={0.5} suffix="%" onChange={(v) => update(u.id, "leasingCommissionNewPct", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="LC renewal %" value={u.leasingCommissionRenewalPct ?? inputs.leasingCommissionRenewalPct} step={0.5} suffix="%" onChange={(v) => update(u.id, "leasingCommissionRenewalPct", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Credit loss %" value={u.creditLossPct ?? inputs.creditLossPct ?? 1} step={0.5} suffix="%" onChange={(v) => update(u.id, "creditLossPct", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Free rent — new (mo)" value={u.freeRentMonthsNew ?? inputs.freeRentMonthsNew ?? 0} step={1} suffix="mo" onChange={(v) => update(u.id, "freeRentMonthsNew", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="Free rent — renewal (mo)" value={u.freeRentMonthsRenewal ?? inputs.freeRentMonthsRenewal ?? 0} step={1} suffix="mo" onChange={(v) => update(u.id, "freeRentMonthsRenewal", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="TI concession — new ($/SF)" value={u.tiConcessionPSFNew ?? inputs.tiConcessionPSFNew ?? 0} step={0.25} prefix="$" onChange={(v) => update(u.id, "tiConcessionPSFNew", v)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumCell label="TI concession — renewal ($/SF)" value={u.tiConcessionPSFRenewal ?? inputs.tiConcessionPSFRenewal ?? 0} step={0.25} prefix="$" onChange={(v) => update(u.id, "tiConcessionPSFRenewal", v)} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">
                      {isOccupied ? `$${Math.round(annualRevenue / 1000)}k` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        aria-label={`Remove unit ${u.name}`}
                        onClick={() => removeUnit(u.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-blue-50/30">
                      <td colSpan={COL_HEADERS.length + 3}>
                        <LeaseDetails unit={u} inputs={inputs} onField={(k, v) => setLeaseField(u, k, v)} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                <td className="px-2 py-2 text-xs" colSpan={3}>{units.length} units</td>
                <td className="px-2 py-2 text-xs text-right tabular-nums" colSpan={2}>
                  {units.reduce((s, u) => s + u.squareFeet, 0).toLocaleString()} SF total
                </td>
                <td className="px-2 py-2 text-xs text-right tabular-nums" colSpan={2}>
                  {units.filter((u) => u.leaseStatus === "occupied").length} occupied
                </td>
                <td className="px-2 py-2 text-xs text-right tabular-nums" colSpan={4}>
                  ${(units.filter((u) => u.leaseStatus === "occupied").reduce((s, u) => s + u.currentRentPSF * u.squareFeet, 0) / 1000).toFixed(0)}k contracted rev/yr
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
