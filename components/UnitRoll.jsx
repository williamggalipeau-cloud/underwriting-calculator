"use client";

import { useId, useRef, useState } from "react";

// ─── CSV import ───────────────────────────────────────────────────────────────

// Normalise a header string: lowercase, strip spaces/underscores/slashes
function normalise(s) { return s.toLowerCase().replace(/[\s_/]+/g, ""); }

// Map normalised CSV header → unit field name (and optional transform fn)
const CSV_FIELD_MAP = [
  { keys: ["unit", "unitname", "name", "suite"],                   field: "name",                        parse: String },
  { keys: ["sf", "squarefeet", "squarefoot", "sqft", "size"],      field: "squareFeet",                  parse: Number },
  { keys: ["tenant", "tenantname", "lessee"],                      field: "tenantName",                  parse: String },
  { keys: ["business", "description", "businessdesc", "use"],      field: "businessDescription",         parse: String },
  { keys: ["credit", "creditrating", "rating"],                    field: "creditRating",                parse: String },
  { keys: ["sic", "naics", "naicscode", "siccode", "industry"],    field: "naicsCode",                   parse: String },
  { keys: ["status", "leasestatus", "occupied"],                   field: "leaseStatus",                 parse: (v) => /^(occupied|occ|yes|true|1|y)$/i.test(v.trim()) ? "occupied" : "vacant" },
  { keys: ["leasetype", "lease", "type"],                          field: "leaseType",                   parse: (v) => ["NNN","MG","Gross"].includes(v.trim()) ? v.trim() : "NNN" },
  { keys: ["rent", "rentpsf", "currentrent", "contractedrent"],    field: "currentRentPSF",              parse: Number },
  { keys: ["otherincome", "otherinc", "otherincomepsf"],           field: "otherIncomePSF",              parse: Number },
  { keys: ["escalation", "escpct", "annualescalation", "esc"],     field: "annualEscalationPct",         parse: Number },
  { keys: ["monthsremaining", "moleft", "moremaining", "months"],  field: "monthsRemaining",             parse: Number },
  { keys: ["newterm", "newleaseterm", "leasetermmonths"],           field: "newLeaseTerm",                parse: Number },
  { keys: ["renewalpct", "renew", "renewalprob", "renewalprobability"], field: "renewalProbabilityPct",   parse: Number },
  { keys: ["tinew", "tipersfnew"],                                 field: "tiNewPSF",                    parse: Number },
  { keys: ["tirenewal", "tiren", "tipersfrenewal"],                field: "tiRenewalPSF",                parse: Number },
  { keys: ["lcnew", "leasingcommissionnew", "lcnewpct"],           field: "leasingCommissionNewPct",     parse: Number },
  { keys: ["lcrenewal", "lcren", "leasingcommissionrenewal"],      field: "leasingCommissionRenewalPct", parse: Number },
  { keys: ["retax", "realestatetax", "retaxpsf", "taxpsf"],        field: "realEstateTaxPSF",            parse: Number },
  { keys: ["insurance", "insurancepsf", "ins"],                    field: "insurancePSF",                parse: Number },
  { keys: ["utilities", "utilpsf", "utils"],                       field: "utilitiesPSF",                parse: Number },
  { keys: ["maintenance", "maintpsf", "maint"],                    field: "maintenancePSF",              parse: Number },
  { keys: ["janitorial", "janitpsf", "janit"],                     field: "janitorialPSF",               parse: Number },
];

function buildHeaderIndex(headerRow) {
  const index = {};
  headerRow.forEach((raw, col) => {
    const key = normalise(raw);
    const entry = CSV_FIELD_MAP.find((m) => m.keys.includes(key));
    if (entry) index[entry.field] = { col, parse: entry.parse };
  });
  return index;
}

function parseCSV(text) {
  // Split on newlines; handle \r\n
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  // Simple CSV tokeniser (handles double-quoted fields with commas)
  function tokenise(line) {
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
  }

  const headers = tokenise(lines[0]);
  const index   = buildHeaderIndex(headers);

  if (!index.squareFeet) throw new Error('Required column not found: "SF" (square footage). Check your header row.');

  const units = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = tokenise(lines[i]);
    if (cols.every((c) => c === "")) continue; // skip blank rows

    const unit = {
      id:                        `csv-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      name:                      String(i),
      squareFeet:                0,
      tenantName:                "",
      businessDescription:       "",
      creditRating:              "",
      naicsCode:                 "",
      leaseStatus:               "occupied",
      leaseType:                 "NNN",
      currentRentPSF:            0,
      otherIncomePSF:            0,
      annualEscalationPct:       3,
      monthsRemaining:           12,
      newLeaseTerm:              24,
      renewalProbabilityPct:     60,
      tiNewPSF:                  8,
      tiRenewalPSF:              2,
      leasingCommissionNewPct:   6,
      leasingCommissionRenewalPct: 2,
    };

    for (const [field, { col, parse }] of Object.entries(index)) {
      const raw = cols[col] ?? "";
      if (raw === "") continue;
      const parsed = parse(raw);
      if (field === "squareFeet" || field === "currentRentPSF" || field === "monthsRemaining" || field === "newLeaseTerm") {
        unit[field] = isNaN(parsed) ? unit[field] : Math.max(0, parsed);
      } else {
        unit[field] = isNaN(parsed) && typeof parsed === "number" ? unit[field] : parsed;
      }
    }

    if (unit.squareFeet <= 0) continue; // skip rows with no SF
    units.push(unit);
  }

  if (units.length === 0) throw new Error("No valid data rows found. Make sure the SF column has values > 0.");
  return units;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newUnit(name, squareFeet, inputs, occupied = true, monthsRemaining = 0) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    squareFeet,
    tenantName: "",
    businessDescription: "",
    creditRating: "",
    naicsCode: "",
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

function SummaryStats({ units, propertySF }) {
  if (units.length === 0) return null;

  const totalUnitSF  = units.reduce((s, u) => s + u.squareFeet, 0);
  const occupied     = units.filter((u) => u.leaseStatus === "occupied");
  const occupiedSF   = occupied.reduce((s, u) => s + u.squareFeet, 0);
  const occupancyPct = totalUnitSF > 0 ? (occupiedSF / totalUnitSF) * 100 : 0;
  const sfMismatch   = Math.abs(totalUnitSF - propertySF) > 1;

  const walMonths = occupied.length > 0
    ? occupied.reduce((s, u) => s + u.monthsRemaining * u.squareFeet, 0) / occupiedSF
    : 0;

  const wAvgRent = occupiedSF > 0
    ? occupied.reduce((s, u) => s + u.currentRentPSF * u.squareFeet, 0) / occupiedSF
    : 0;

  const stats = [
    { label: "Units",     value: `${units.length}` },
    { label: "Total SF",  value: totalUnitSF.toLocaleString() },
    { label: "Occupancy", value: `${occupancyPct.toFixed(0)}%` },
    { label: "WAL",       value: `${(walMonths / 12).toFixed(1)} yrs` },
    { label: "Wtd Rent",  value: `$${wAvgRent.toFixed(2)}/SF` },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
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

// ─── Main component ───────────────────────────────────────────────────────────

const COL_HEADERS = [
  { key: "name",      label: "Unit",      width: "w-16", tip: "" },
  { key: "sf",        label: "SF",        width: "w-20", tip: "" },
  { key: "tenant",    label: "Tenant",    width: "w-28", tip: "" },
  { key: "bizDesc",   label: "Business",  width: "w-36", tip: "Business description or tenant use type" },
  { key: "credit",    label: "Credit",    width: "w-20", tip: "Tenant credit rating (e.g. A, BB+, Investment Grade)" },
  { key: "naics",     label: "SIC/NAICS", width: "w-20", tip: "SIC or NAICS industry code" },
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
  { key: "moLeft",    label: "Mo. Left",  width: "w-16", tip: "Months remaining on current lease" },
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

export default function UnitRoll({ units, inputs, onChange }) {
  const headerId  = useId();
  const fileInput = useRef(null);
  const [csvError, setCsvError] = useState(null);

  const update = (id, field, value) =>
    onChange(units.map((u) => (u.id === id ? { ...u, [field]: value } : u)));

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

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = parseCSV(ev.target.result);
        // Backfill any missing per-unit defaults from deal inputs
        const filled = imported.map((u) => ({
          realEstateTaxPSF:            inputs.realEstateTaxPSF,
          insurancePSF:                inputs.insurancePSF,
          utilitiesPSF:                inputs.utilitiesPSF,
          maintenancePSF:              inputs.maintenancePSF,
          janitorialPSF:               inputs.janitorialPSF,
          ...u,
        }));
        setCsvError(null);
        onChange(filled);
      } catch (err) {
        setCsvError(err.message);
      }
    };
    reader.readAsText(file);
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
            accept=".csv,text/csv"
            onChange={handleCSVUpload}
            className="sr-only"
            aria-label="Upload CSV"
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
                Import CSV
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
                Import CSV
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
          <span className="font-semibold shrink-0">CSV import error:</span>
          <span>{csvError}</span>
          <button type="button" onClick={() => setCsvError(null)} className="ml-auto text-red-400 hover:text-red-600 text-base leading-none shrink-0">×</button>
        </div>
      )}

      {/* Summary stats */}
      <SummaryStats units={units} propertySF={inputs.squareFootage} />

      {/* Empty state */}
      {units.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-gray-500">No unit lease roll defined</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Generate a roster from your deal settings, add units manually, or import from a CSV file.
            <br />When units are present, the model uses actual lease schedules instead of portfolio-level vacancy.
          </p>
          <p className="text-xs text-gray-300 mb-4 max-w-lg mx-auto">
            CSV columns (header row required): <span className="font-mono">unit, sf, tenant, business, credit, sic, status, lease_type, rent, escalation, months_remaining, new_term, renewal_pct, ti_new, ti_renewal, lc_new, lc_renewal</span>
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
                {COL_HEADERS.map((h) => (
                  <th key={h.key} title={h.tip} className={`${h.width} px-2 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap`}>
                    {h.label}
                  </th>
                ))}
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map((u) => {
                const isOccupied   = u.leaseStatus === "occupied";
                const annualRevenue = isOccupied ? u.currentRentPSF * u.squareFeet : 0;
                const unitLease    = u.leaseType ?? inputs.leaseType ?? "NNN";

                return (
                  <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!isOccupied ? "bg-red-50/30" : ""}`}>
                    <td className="px-2 py-1.5">
                      <TextCell label="Unit name" value={u.name} onChange={(v) => update(u.id, "name", v)} />
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
                      <TextCell label="SIC/NAICS code" value={u.naicsCode ?? ""} placeholder="e.g. 3440" onChange={(v) => update(u.id, "naicsCode", v)} />
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
                      <NumCell label="Months remaining" value={u.monthsRemaining} step={1} suffix="mo" onChange={(v) => update(u.id, "monthsRemaining", v)} />
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
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                <td className="px-2 py-2 text-xs" colSpan={2}>{units.length} units</td>
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
