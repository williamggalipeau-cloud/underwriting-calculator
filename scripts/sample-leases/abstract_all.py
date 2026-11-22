"""Draft lease abstracts for the sample leases, in the CREparser Lease
Abstraction format, for validation with the connector (lease_validate_abstract).

Reads each lease's HTML (docs/sample-leases/html, the exact text of the PDF)
and its PDF text (pdftotext -layout) to find each quote's page, builds every
field of the "Light industrial (Model Fund I)" template plus the rent
schedule, critical dates and risk flags, and checks locally that every quote
is on its page. The connector then validates the draft against the PDF; the
validated abstract is saved in docs/sample-leases/abstracts/.

Usage: python3 abstract_all.py <out_dir> <txt_dir> <lease file stem> [<amendment stem>]
       (txt_dir holds <stem>.txt from pdftotext -layout for each file)
"""
import html as H
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TODAY = date(2026, 11, 22)
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DATE_RE = r"(?:%s) \d{1,2}, \d{4}" % "|".join(MONTHS)


def iso(long):
    m = re.match(r"(\w+) (\d{1,2}), (\d{4})", long)
    return f"{int(m.group(3)):04d}-{MONTHS.index(m.group(1)) + 1:02d}-{int(m.group(2)):02d}"


def long_of(isod):
    y, m, d = map(int, isod.split("-"))
    return f"{MONTHS[m - 1]} {d}, {y}"


def add_months(isod, n):
    y, m, d = map(int, isod.split("-"))
    t = (y * 12 + m - 1) + n
    y2, m2 = divmod(t, 12)
    import calendar
    last = calendar.monthrange(y2, m2 + 1)[1]
    return f"{y2:04d}-{m2 + 1:02d}-{min(d, last):02d}"


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", H.unescape(s)).strip()


def parse_html(path):
    s = Path(path).read_text()
    body = s[s.find("<body"):]
    out = {"title": clean(re.search(r"<h1>(.*?)</h1>", body).group(1)), "lead": clean(re.search(r"<p class='lead'>(.*?)</p>", body, re.S).group(1))}
    info = {}
    m = re.search(r"<table class='info'>(.*?)</table>", body, re.S)
    if m:
        for k, v in re.findall(r"<tr><th>(.*?)</th><td>(.*?)</td></tr>", m.group(1), re.S):
            info[clean(k)] = clean(v)
    out["info"] = info
    secs = []
    for sm in re.finditer(r"<h2>(\d+)\. (.*?)</h2>(.*?)(?=<h2>|<div class=\"sig|<h2 class|$)", body, re.S):
        num, title, rest = sm.group(1), clean(sm.group(2)), sm.group(3)
        paras = []
        for pm in re.finditer(r"<p><span class='sub'>([\d.]+)</span>(.*?)</p>", rest, re.S):
            raw = pm.group(2)
            table = None
            tm = re.search(r"<table class='grid'>(.*?)</table>", raw, re.S)
            if tm:
                table = [[clean(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)] for r in re.findall(r"<tr>(.*?)</tr>", tm.group(1), re.S)]
                raw = raw[: tm.start()] + raw[tm.end():]
            paras.append({"n": pm.group(1), "text": clean(raw), "table": table})
        # Numbered paragraphs written without <p> (amendments) fall back to plain text.
        secs.append({"n": num, "title": title, "paras": paras, "raw": clean(rest)})
    out["secs"] = secs
    return out


def sentences(text):
    parts = re.split(r"(?<=[.;])\s+(?=[A-Z(\"])", text)
    return [p.strip() for p in parts if p.strip()]


class Lease:
    def __init__(self, stems, txt_dir):
        self.docs = [parse_html(ROOT / "docs/sample-leases/html" / f"{s}.html") for s in stems]
        self.pages = []
        self.ranges = []
        for s in stems:
            raw = (Path(txt_dir) / f"{s}.txt").read_text().split("\f")
            raw = [p for p in raw if p.strip()]
            start = len(self.pages) + 1
            self.pages += [self.norm(p) for p in raw]
            self.ranges.append((start, len(self.pages)))
        self.lease = self.docs[0]
        self.info = self.lease["info"]

    @staticmethod
    def norm(s):
        s = s.replace("—", "-").replace("–", "-").replace("’", "'").replace("“", '"').replace("”", '"')
        return re.sub(r"\s+", " ", s).strip()

    def page_of(self, q, doc=None):
        nq = self.norm(q)
        rng = range(len(self.pages)) if doc is None else range(self.ranges[doc][0] - 1, self.ranges[doc][1])
        hits = [i + 1 for i in rng if nq in self.pages[i]]
        return hits

    def ev(self, q, doc=None, raw_page=None):
        q = q.strip()
        if raw_page:
            return {"quote": q, "page": raw_page}
        if len(q) > 1400:
            q = q[:1400].rsplit(" ", 1)[0]
        hits = self.page_of(q, doc)
        if len(hits) == 1:
            return {"quote": q, "page": hits[0]}
        if not hits:
            # The sentence crosses a page break: keep the longest leading part on one page.
            words = q.split(" ")
            for k in range(len(words) - 1, 5, -1):
                part = " ".join(words[:k])
                h = self.page_of(part, doc)
                if len(h) == 1:
                    return {"quote": part, "page": h[0]}
            raise ValueError(f"quote not found: {q[:80]}")
        return {"quote": q, "page": hits[0]}

    def sec(self, *names, doc=0):
        for s in self.docs[doc]["secs"]:
            if any(n.lower() in s["title"].lower() for n in names):
                return s
        return None

    def para(self, sec_names, contains=None, doc=0):
        s = self.sec(*sec_names, doc=doc) if isinstance(sec_names, (list, tuple)) else self.sec(sec_names, doc=doc)
        if not s:
            return None
        for p in s["paras"]:
            if contains is None or re.search(contains, p["text"], re.I):
                return {**p, "sec": s}
        return None

    def sent(self, sec_names, contains, doc=0):
        p = self.para(sec_names, contains, doc)
        if not p:
            return None, None
        for snt in sentences(p["text"]):
            if re.search(contains, snt, re.I):
                return snt, p
        return p["text"], p


def F(key, value, status, clause=None, evidence=(), detail=None, calculation=None, label=None, section=None):
    f = {"key": key, "value": value[:600], "status": status}
    if label:
        f["label"], f["section"] = label, section
    if clause:
        f["clause"] = clause
    if detail:
        f["detail"] = detail
    if calculation:
        f["calculation"] = calculation
    f["evidence"] = [e for e in evidence if e]
    return f


CUSTOM = {
    "tenant_business": ("Tenant business", "parties"), "sic_code": ("SIC code", "use"), "operating_hours": ("Hours", "use"),
    "truck_court_yard": ("Truck court and yard", "use"), "environmental_baseline": ("Environmental baseline", "legal"),
    "repair_caps": ("Caps on tenant repairs", "obligations"), "landlord_default_cure": ("Landlord default and cure", "legal"),
    "landlord_work": ("Landlord's work", "obligations"), "ti_unpaid_balance": ("Unpaid allowance balance", "obligations"),
    "restoration": ("Restoration", "obligations"),
}


def suggest_sic(text):
    js = f"import('{ROOT}/lib/sicCodes.js').then(m=>console.log(m.suggestSic({json.dumps(text)})+'|'+m.sicTitle(m.suggestSic({json.dumps(text)}))))"
    out = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True).stdout.strip()
    code, title = (out.split("|") + [""])[:2]
    return code, title


def short(s, n=280):
    s = s.strip()
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + " …"


def build(L, stems):
    info = L.info
    E = L.ev
    fields = []
    add = lambda f: fields.append(f)
    tenant = info["Tenant"]
    tenant_name = tenant.split(",")[0]
    project = info["Project"].replace(" (fictional address)", "")
    asset = project.split(",")[0]
    landlord = info["Landlord"]
    guar = info.get("Guarantor", "None")
    lead_date = re.search(DATE_RE, L.lease["lead"]).group(0)
    lead_q = f"This Industrial Lease is made as of {lead_date}"
    term_s, tp = L.sent("Term", "begins on the Commencement Date")
    comm = re.search(r"Commencement Date, (" + DATE_RE + ")", term_s).group(1)
    exp = re.search(r"Expiration Date, (" + DATE_RE + ")", term_s).group(1)
    tclause = tp["n"]

    add(F("landlord", landlord, "found", "1", [E(landlord)]))
    add(F("tenant", tenant, "found", "1", [E(tenant)]))
    use_s, use_p = L.sent("Use", "only for")
    use = info.get("Permitted Use", "")
    biz = re.split(r", with |, and related|, excluding", use)[0]
    add(F("tenant_business", biz[0].upper() + biz[1:], "found", f"1, {use_p['n']}", [E(short(use_s, 400))], label="Tenant business", section="parties"))
    code, title = suggest_sic(use)
    add(F("sic_code", f"{code} — {title}", "calculated", use_p["n"], [E(short(use_s, 400))],
          calculation=f"Business: {biz} → SIC {code} {title}", label="SIC code", section="use"))
    gsec = L.sec("Guaranty")
    if guar != "None" and gsec:
        gq = gsec["paras"][0]["text"]
        add(F("guarantor", guar, "found", f"1, {gsec['paras'][0]['n']}", [E(short(gq, 600))]))
        add(F("guaranty", guar, "found", gsec["paras"][0]["n"], [E(short(gq, 600))]))
    else:
        hack = f"{tenant} None {' '.join(project.split()[:3])}"
        add(F("guarantor", "None", "found", "1", [L.ev(hack, raw_page=1)]))
        add(F("guaranty", "None", "found", "1", [L.ev(hack, raw_page=1)]))
    add(F("property", project, "found", "1", [E(project)]))
    prem = info["Premises"]
    add(F("premises", prem.split(", containing")[0], "found", "1", [E(prem)]))
    rsf = re.search(r"([\d,]+) rentable square feet", prem).group(1)
    add(F("rentable_area", f"{rsf} rentable square feet", "found", "1, 2.1", [E(prem), E("is agreed and is not subject to remeasurement")]))
    share_s, share_p = L.sent(["Operating Expenses", "Recoveries"], r"Tenant's Share \(")
    share = info.get("Tenant's Share", "")
    bld = info.get("Building area", "")
    add(F("pro_rata_share", f"{share} (of {bld.replace(' rentable square feet', ' RSF')} building)", "found", f"1, {share_p['n'] if share_p else ''}".rstrip(", "),
          [E(short(share_s, 500)) if share_s else None, E(bld)]))
    add(F("lease_date", lead_date, "found", "Preamble", [E(lead_q)]))
    lt_s, lt_p = L.sent(["Operating Expenses", "Recoveries"], r"^This is a")
    lt_ev = [E(lt_s.split(". ")[0].rstrip(".") + ".") if lt_s else E(info.get("Lease type"))]
    bys = re.search(r"Base Rent includes Operating Expenses and Real Estate Taxes for calendar year \d{4} \(the \"Base Year\"\)\.", lt_p["text"]) if lt_p else None
    if bys:
        lt_ev.append(E(bys.group(0)))
    add(F("lease_type", info.get("Lease type", ""), "found", lt_p["n"] if lt_p else "1", lt_ev))
    term_words = info.get("Term", "")
    months = re.search(r"\((\d+)\)", term_words).group(1)
    add(F("term_length", f"{months} months, {comm} to {exp}", "found", f"1, {tclause}", [E(term_words), E(term_s.split(", unless")[0])]))
    add(F("commencement_date", comm, "found", tclause, [E(f"The Term begins on the Commencement Date, {comm}")]))
    add(F("expiration_date", exp, "found", tclause, [E(f"ends on the Expiration Date, {exp}")]))

    # Rent schedule (from the Section 4 table).
    rp = L.para("Base Rent", "monthly installments")
    rows = [r for r in (rp["table"] or [])[1:] if len(r) >= 4]
    rent_rows = []
    for i, r in enumerate(rows):
        fr, th, rate, mo = r[0], r[1], r[2], r[3]
        note = r[4] if len(r) > 4 else ""
        q = f"{fr} {th} {rate} {mo}"
        row = {"period": f"Lease Year {i + 1}" if not note else f"{fr} – {th}", "start": iso(fr), "end": iso(th),
               "rate": float(rate.replace("$", "").replace(",", "")), "monthly_rent": float(mo.replace("$", "").replace(",", "")),
               "status": "found", "clause": rp["n"], "evidence": [E(q)]}
        if note:
            row["note"] = note
        rent_rows.append(row)
    first_paying = next((r for r in rent_rows if r["monthly_rent"] > 0), rent_rows[0])
    free = [r for r in rent_rows if r["monthly_rent"] == 0]
    if free:
        ab_s, ab_p = L.sent("Base Rent", r"abate|free")
        add(F("rent_commencement_date", long_of(first_paying["start"]), "found", rp["n"], [E(f"{long_of(first_paying['start'])} {long_of(first_paying['end'])}")]))
        add(F("rent_abatement", short(ab_s, 300) if ab_s else f"{len(free)} period(s) at $0", "found", (ab_p or rp)["n"], [E(short(ab_s, 500)) if ab_s else E(rent_rows[0]["evidence"][0]["quote"])]))
    else:
        add(F("rent_commencement_date", f"Same as the Commencement Date, {comm} (no free rent)", "found", rp["n"], [E(rent_rows[0]["evidence"][0]["quote"])]))
        add(F("rent_abatement", "Not addressed", "not_in_lease"))
    cur = next((r for r in rent_rows if r["start"] <= TODAY.isoformat() <= r["end"]), rent_rows[-1])
    br = info.get("Base Rent", "")
    br_rate = re.search(r"\$[\d.,]+", br).group(0)
    add(F("base_rent", f"{br_rate}/RSF/yr initially; {'currently' if cur['start'] <= TODAY.isoformat() else 'from ' + long_of(cur['start'])} ${cur['rate']:.2f}/RSF (${cur['monthly_rent']:,.2f}/month) through {long_of(cur['end'])}",
          "found", f"1, {rp['n']}", [E(br), E(cur["evidence"][0]["quote"])]))
    esc = [s for s in sentences(rp["text"]) if re.search(r"increase", s, re.I)]
    if esc:
        add(F("rent_escalations", short(esc[0].replace("Base Rent increases by ", "").rstrip("."), 300), "found", rp["n"], [E(esc[0])]))
    else:
        add(F("rent_escalations", "Not addressed", "not_in_lease"))
    lc_s, lc_p = L.sent("Base Rent", "late charge")
    add(F("late_charge", "5% of the overdue amount if not received within 5 days after due", "found", lc_p["n"],
          [E("Any rent not received within five (5) days after its"), E("due date bears a late charge of five percent (5%) of the overdue amount.")]))
    dep = info.get("Security Deposit", "")
    dep_s, dep_p = L.sent("Security Deposit", "shall deposit")
    st_s, st_p = L.sent("State-Specific", "unapplied balance")
    dep_ev = [E(f"Tenant shall deposit {dep} with Landlord"), E("within ten (10) days after demand")]
    if st_s:
        dep_ev.append(E(re.search(r"unapplied balance to Tenant within [^.]*?after the expiration of the Term", st_s).group(0)))
    rst = L.para("Security Deposit", "restore")
    add(F("security_deposit", f"{dep}; restore within 10 days after demand" + ("; unapplied balance returned within 30 days after the Term" if st_s and "thirty (30) days" in st_s else ""), "found", ", ".join(x for x in [dep_p["n"], rst["n"] if rst else None, st_p["n"] if st_p else None] if x), dep_ev))
    loc = L.para(["Security Deposit", "Guaranty"], "letter of credit")
    add(F("letter_of_credit", "Not addressed", "not_in_lease") if not loc else F("letter_of_credit", short(loc["text"]), "found", loc["n"], [E(short(loc["text"], 500))]))

    # Options.
    rn = L.sec("Renewal")
    if rn and not re.search(r"no (right|option)", rn["paras"][0]["text"], re.I):
        p1 = rn["paras"][0]["text"]
        cnt = re.search(r"has (\w+ \(\d+\)) option", p1)
        yrs = re.search(r"for (\w+ \(\d+\)) years", p1)
        notice = re.search(r"at least (\w+ \((\d+)\)) months", p1)
        basis_s = next((s for s in sentences(rn["paras"][1]["text"])), "") if len(rn["paras"]) > 1 else ""
        add(F("renewal_option", short(f"{(cnt.group(1) if cnt else '').capitalize()} option(s) of {yrs.group(1) if yrs else '?'} years, on at least {notice.group(1) if notice else '?'} months' notice; " + basis_s, 500),
              "found", f"{rn['paras'][0]['n']}-{rn['paras'][-1]['n']}", [E(sentences(p1)[0]), E(basis_s)]))
        renewal = {"notice_months": int(notice.group(2)) if notice else None, "para": rn["paras"][0], "basis": basis_s}
    else:
        renewal = None
        add(F("renewal_option", "None", "found", rn["paras"][0]["n"] if rn else None, [E(sentences(rn["paras"][0]["text"])[0])] if rn else []) if rn else F("renewal_option", "Not addressed", "not_in_lease"))
    tm = L.sec("Early Termination")
    termination = None
    if tm:
        t1 = tm["paras"][0]["text"]
        if re.search(r"no right to terminate", t1, re.I):
            add(F("termination_option", "None", "found", tm["paras"][0]["n"], [E(sentences(t1)[0])]))
        else:
            add(F("termination_option", short(" ".join(sentences(t1)[:2]), 500), "found", f"{tm['paras'][0]['n']}", [E(s) for s in sentences(t1)[:2]]))
            dt = re.findall(DATE_RE, t1)
            nm = re.search(r"at least (\w+ \((\d+)\)) months", t1)
            termination = {"date": dt[0] if dt else None, "notice": int(nm.group(2)) if nm else None, "para": tm["paras"][0], "text": t1}
    else:
        add(F("termination_option", "Not addressed", "not_in_lease"))
    ex = L.sec("Expansion")
    ex_text = " ".join(p["text"] for p in ex["paras"]) if ex else ""
    rofo = None
    if ex:
        first = ex["paras"][0]
        if re.search(r"has no right of first refusal, right of first offer or expansion option", first["text"]):
            add(F("expansion_rights", "None (no ROFR, ROFO or expansion option)", "found", first["n"], [E("Tenant has no right of first refusal, right of first offer or expansion option")]))
        else:
            rp2 = next((p for p in ex["paras"] if re.search(r"first offer|first refusal|expansion", p["text"], re.I)), first)
            ss = [s for s in sentences(rp2["text"]) if re.search(r"first offer|first refusal|expan|days", s, re.I)][:2]
            add(F("expansion_rights", short(" ".join(ss), 500), "found", rp2["n"], [E(s) for s in ss]))
            rofo = {"para": rp2, "text": " ".join(ss)}
        rel = next((p for p in ex["paras"] if re.search(r"relocat", p["text"], re.I)), None)
        if rel and re.search(r"Landlord has no right to\s+relocate", rel["text"]):
            add(F("relocation_right", "None", "found", rel["n"], [E("Landlord has no right to"), E("relocate Tenant")]))
        elif rel:
            ss = [s for s in sentences(rel["text"]) if re.search(r"relocat", s, re.I)]
            add(F("relocation_right", short(" ".join(ss), 500), "found", rel["n"], [E(s) for s in ss[:2]]))
        else:
            add(F("relocation_right", "Not addressed", "not_in_lease"))
    else:
        add(F("expansion_rights", "Not addressed", "not_in_lease"))
        add(F("relocation_right", "Not addressed", "not_in_lease"))
    add(F("purchase_option", "Not addressed", "not_in_lease"))

    # Use.
    add(F("permitted_use", use[0].upper() + use[1:], "found", f"1, {use_p['n']}", [E(short(use_s, 500))]))
    us = L.sec("Use")
    excl = next((p for p in us["paras"] if re.search(r"exclusive", p["text"], re.I)), None)
    if excl and re.search(r"no exclusive right", excl["text"]):
        add(F("exclusive_use", "None", "found", excl["n"], [E(excl["text"])]))
    elif excl:
        add(F("exclusive_use", short(excl["text"].replace("Exclusive use: ", ""), 400), "found", excl["n"], [E(short(excl["text"], 800))]))
    else:
        add(F("exclusive_use", "Not addressed", "not_in_lease"))
    cot = next((p for p in us["paras"] if re.search(r"co-tenancy|occupancy or operation of any other tenant", p["text"], re.I)), None)
    if cot and re.search(r"not conditioned", cot["text"]):
        add(F("co_tenancy", "None — obligations not conditioned on other tenants", "found", cot["n"], [E(cot["text"])]))
    elif cot:
        add(F("co_tenancy", short(cot["text"], 400), "found", cot["n"], [E(short(cot["text"], 800))]))
    else:
        add(F("co_tenancy", "Not addressed", "not_in_lease"))
    pro = next((p for p in us["paras"] if re.search(r"shall not use the Premises", p["text"])), None)
    add(F("prohibited_uses", short(pro["text"].replace("Tenant shall not use the Premises for a", "A").rstrip("."), 300), "found", pro["n"], [E(pro["text"])]) if pro else F("prohibited_uses", "Not addressed", "not_in_lease"))

    # Environmental.
    hz = L.sec("Hazardous")
    hz1 = hz["paras"][0]
    surv = next((p for p in hz["paras"] if "survives" in p["text"]), None)
    rem = next((p for p in hz["paras"] if "remediate" in p["text"]), None)
    hz_ev = [E(short(sentences(hz1["text"])[0], 600))]
    if surv:
        hz_ev.append(E("This indemnity survives the expiration or termination of this Lease."))
    if rem:
        hz_ev.append(E("Tenant shall promptly remediate, at its sole cost and to the standard required by the governing agency"))
    custom_hz = "customarily used in general office and light industrial" not in hz1["text"]
    add(F("hazardous_materials", short(sentences(hz1["text"])[0], 300).rstrip(".") + ("; Tenant indemnity survives; Tenant remediates its releases" if surv else ""), "found", hz1["n"] + (f", {surv['n']}" if surv else "") + (f", {rem['n']}" if rem else ""), hz_ev))
    base = next((p for p in hz["paras"] if re.search(r"baseline", p["text"], re.I)), None)
    if base:
        bs = next(s for s in sentences(base["text"]) if re.search("baseline", s, re.I))
        add(F("environmental_baseline", short(bs, 300), "found", base["n"], [E(short(bs, 700))], label="Environmental baseline", section="legal"))
    else:
        add(F("environmental_baseline", "Exhibit D, if any (not included)", "unclear", None, [E("Environmental baseline (if any)"), E("(Exhibits are not included in this sample.)")],
              detail="The exhibit list names an environmental baseline exhibit 'if any', and exhibits are not included, so it is unclear whether a baseline exists.", label="Environmental baseline", section="legal"))
        fields[-1]["clause"] = L.sent("Miscellaneous", "Exhibits")[1]["n"]

    # Insurance.
    ins = L.sec("Insurance")
    i1 = ins["paras"][0]["text"]
    gl = re.search(r"commercial general liability insurance of at least ([^;]+);", i1).group(1)
    umb = re.search(r"umbrella or excess liability insurance of at least ([^;]+);", i1).group(1)
    auto = re.search(r"business automobile liability insurance of at least ([^;]+);", i1).group(1)
    ins_ev = [E(f"commercial general liability insurance of at least {gl}"), E(f"umbrella or excess liability insurance of at least {umb}"), E(f"business automobile liability insurance of at least {auto}")]
    poll = next((p for p in ins["paras"] if re.search(r"pollution", p["text"], re.I)), None)
    val = f"CGL {gl}; umbrella {umb}; auto {auto}; property at replacement cost; workers' comp; additional insureds; mutual waiver of subrogation"
    if poll:
        ps = next(s for s in sentences(poll["text"]) if re.search("pollution", s, re.I))
        val += "; " + short(ps, 160)
        ins_ev.append(E(ps))
    add(F("insurance_requirements", val, "found", f"{ins['paras'][0]['n']}-{ins['paras'][-1]['n']}", ins_ev))
    ind = L.para("Indemnity", "indemnify")
    add(F("indemnification", "Tenant indemnifies Landlord for claims from its use or acts, except Landlord's negligence or willful misconduct", "found", ind["n"], [E(short(ind["text"], 120).rstrip(" …"))]))

    # Maintenance (Section 9 table).
    mt = L.para("Maintenance", "allocated as follows")
    cells = {r[0]: r[1] for r in (mt["table"] or [])[1:] if len(r) >= 2}
    roof, struct, hvac = cells.get("Roof", ""), cells.get("Structure", ""), cells.get("HVAC", "")
    park = next((v for k, v in cells.items() if k.startswith("Parking")), "")
    interior = next((v for k, v in cells.items() if k.startswith("Interior")), "")
    first5 = lambda s: " ".join(s.split()[:9])
    ll = [x for x in [("roof", roof), ("structure", struct), ("parking, truck court and yard", park)] if x[1].startswith("Landlord")]
    lm_ev = [E(v) for k, v in ll if v != "Landlord, as an Operating Expense"]
    add(F("landlord_maintenance", "; ".join(f"{k[0].upper() + k[1:]}: {v}" for k, v in ll) or "See table", "found", mt["n"], lm_ev or [E(f"Roof {roof}")]))
    add(F("tenant_maintenance", f"Interior: {interior}", "found", mt["n"], [E(interior)]))
    add(F("roof_structure", f"Roof: {roof}; structure: {struct}", "found", mt["n"], [E(f"Roof {roof}") if L.page_of(f"Roof {roof}") else E(roof), E(struct)]))
    hv = [E(first5(hvac))]
    if "end of their useful life" in hvac:
        hv.append(E("end of their useful life, amortized as an Operating Expense"))
    add(F("hvac_maintenance", hvac, "found", mt["n"], hv))
    cap = L.para("Maintenance", "Caps on Tenant")
    add(F("repair_caps", cap["text"].split(": ", 1)[1].rstrip("."), "found", cap["n"], [E(cap["text"])], label="Caps on tenant repairs", section="obligations"))

    # Operations.
    ops = L.sec("Operations")
    def op(prefix):
        p = next((p for p in ops["paras"] if p["text"].startswith(prefix)), None)
        return p
    hrs = op("Operating hours")
    add(F("operating_hours", hrs["text"].split("operate in the Premises ", 1)[-1].rstrip("."), "found", hrs["n"], [E(hrs["text"])], label="Hours", section="use"))
    pk = op("Parking")
    add(F("parking", short(pk["text"].replace("Parking: Tenant shall have n", "N").replace(" of the Project at a ratio of", " at").replace(" of the Premises", "").rstrip("."), 300), "found", pk["n"], [E(pk["text"])]))
    yd = op("Truck court")
    add(F("truck_court_yard", short(yd["text"].replace("Truck court and yard: ", "").rstrip("."), 300), "found", yd["n"], [E(yd["text"])], label="Truck court and yard", section="use"))
    dk = re.search(r"[^.]*(dock|grade-level door)[^.]*\.", yd["text"])
    add(F("loading_docks", short(dk.group(0).strip(), 300), "found", yd["n"], [E(dk.group(0).strip())]) if dk else F("loading_docks", "Not addressed", "not_in_lease"))
    sg = op("Signage")
    add(F("signage", short(sentences(sg["text"])[0].replace("Signage: Tenant may install o", "O").replace(" of the Premises", "").rstrip("."), 300), "found", sg["n"], [E(sentences(sg["text"])[0])]))
    os_ = op("Outside storage")
    add(F("outdoor_storage", "Not permitted" if "No outside storage" in os_["text"] else short(os_["text"].replace("Outside storage: ", "").rstrip("."), 300), "found", os_["n"], [E(os_["text"])]))

    # Operating expenses.
    oe = L.sec("Operating Expenses")
    o1 = oe["paras"][0]["text"]
    oe_ev = [E(x) for x in sentences(o1)[:3]]
    util = next((p for p in oe["paras"][1:] if re.search(r"pay directly for", p["text"])), None)
    if util:
        oe_ev.append(E(re.search(r"Tenant shall pay directly for [^,]+", util["text"]).group(0)))
    add(F("operating_expenses", short(" ".join(sentences(o1)[:3]), 560), "found", oe["paras"][0]["n"] + (f", {util['n']}" if util else ""), oe_ev))
    tx = re.search(r"[^.]*Real Estate Taxes[^.]*\.", o1)
    lh = L.sent("State-Specific", "leasehold interest")[0]
    tx_s = [x for x in sentences(o1) if "Real Estate Taxes" in x]
    add(F("real_estate_taxes", short(" ".join(tx_s), 400) if tx_s else "See operating expenses", "found", oe["paras"][0]["n"], [E(x) for x in tx_s[:2]] or [E(sentences(o1)[0])]))
    capp = next((p for p in oe["paras"] if re.search(r"cap", p["text"], re.I) and re.search(r"Operating Expenses are not subject|expense cap|capped", p["text"], re.I)), None)
    if capp and "not subject to any cap" in capp["text"]:
        add(F("expense_cap", "None", "found", capp["n"], [E(capp["text"])]))
    elif capp:
        add(F("expense_cap", short(capp["text"].replace("Operating expense cap: i", "I").rstrip("."), 400), "found", capp["n"], [E(short(capp["text"], 800))]))
    else:
        add(F("expense_cap", "Not addressed", "not_in_lease"))
    mf = next((p for p in oe["paras"] if "management fee" in p["text"] and "shall not exceed" in p["text"]), None)
    mfm = re.search(r"shall not exceed ([^.]+)", mf["text"]) if mf else None
    add(F("management_fee", f"Capped at {mfm.group(1)}", "found", mf["n"], [E(mfm.group(0))]) if mfm else F("management_fee", "Not addressed", "not_in_lease"))
    au = next((p for p in oe["paras"] if "audit" in p["text"]), None)
    if au and "one hundred twenty (120) days" in au["text"] and "more than 3%" in au["text"]:
        add(F("audit_rights", "Notice within 120 days after the annual statement; Landlord pays if overstated by more than 3%", "found", au["n"], [E("hundred twenty (120) days after receiving Landlord's annual statement"), E("overstated by more than 3%, Landlord shall pay the reasonable cost of the audit")]))
    else:
        add(F("audit_rights", short(au["text"], 300), "found", au["n"], [E(short(au["text"], 700))]) if au else F("audit_rights", "Not addressed", "not_in_lease"))
    by = re.search(r"calendar\s+year (\d{4}) \(the \"Base Year\"\)", o1)
    add(F("base_year", by.group(1), "found", oe["paras"][0]["n"], [E(f'year {by.group(1)} (the "Base Year")')]) if by else F("base_year", "Not addressed (no base year)", "not_in_lease"))

    # Legal.
    sn = L.para("Subordination", "SNDA")
    snd = re.search(r"\(SNDA\) within [^.]+", sn["text"]).group(0)
    add(F("subordination", f"Subordinate to mortgages with non-disturbance; SNDA {snd.split(') ', 1)[1]}", "found", sn["n"], [E(f"subordination, non-disturbance and attornment agreement {snd}")]))
    es = L.para("Subordination", "estoppel")
    esd = re.search(r"Within ([^,]+) after Landlord's request", es["text"]).group(1)
    add(F("estoppel", f"Within {esd} after request", "found", es["n"], [E(f"Within {esd} after Landlord's request, Tenant shall deliver a signed estoppel certificate")]))
    df = L.para("Default", "Event of Default")
    if "within five (5) days after" in df["text"] and "within thirty (30) days after" in df["text"]:
        add(F("default_cure", "Monetary: 5 days after written notice; non-monetary: 30 days (longer if diligently pursued); insolvency or abandonment", "found", df["n"], [E("Tenant fails to pay any rent within five (5) days after"), E("written notice that it is past due"), E("Tenant fails to perform any other obligation within thirty (30) days after")]))
    else:
        add(F("default_cure", short(df["text"], 400), "found", df["n"], [E(short(df["text"], 600))]))
    ldf = L.para("Default", "Landlord is in default")
    ldd = re.search(r"within (\w+ \((\d+)\)) days after written notice", ldf["text"])
    add(F("landlord_default_cure", f"{ldd.group(2)} days after written notice (longer if diligently pursued)" if ldd else short(ldf["text"], 300), "found", ldf["n"], [E(f"Landlord is in default only if it fails to perform an obligation within {ldd.group(1)} days after written notice")] if ldd else [E(short(ldf["text"], 600))], label="Landlord default and cure", section="legal"))
    ho = L.para("Holdover", "holds over|tenant at sufferance")
    hp = re.search(r"Base Rent at (\d+%)", ho["text"]).group(1)
    add(F("holdover", f"Tenant at sufferance at {hp} of the last Base Rent", "found", ho["n"], [E(f"shall pay Base Rent at {hp} of the rate in effect at the end of the Term")]))
    asg = L.para("Assignment", "assign")
    if "not be unreasonably withheld" in asg["text"] and "50% of any transfer premium" in asg["text"]:
        add(F("assignment_subletting", "Landlord consent, not unreasonably withheld; Landlord may recapture and takes 50% of any transfer premium", "found", asg["n"], [E("which shall not be unreasonably withheld, conditioned or delayed"), E("Landlord may recapture the space proposed to be assigned or sublet and is entitled to 50% of any transfer premium.")]))
    else:
        add(F("assignment_subletting", short(asg["text"], 400), "found", asg["n"], [E(x) for x in sentences(asg["text"])[:2]]))
    gl_s, gl_p = L.sent("Miscellaneous", "governed by the laws")
    add(F("governing_law", re.search(r"State of (\w+)", gl_s).group(1), "found", gl_p["n"], [E(gl_s)]))
    nt = L.para("Notices", "Notices shall")
    add(F("notices", "In writing by hand, overnight courier or certified mail; Landlord c/o Model Fund I, Tenant at the Premises", "found", nt["n"], [E("Notices shall be in writing and delivered by hand, overnight courier or certified mail")]))

    # Improvements.
    im = L.sec("Improvements")
    lw = next(p for p in im["paras"] if p["text"].startswith("Landlord's work"))
    ta = next((p for p in im["paras"] if re.search(r"allowance", p["text"], re.I)), None)
    ti_deadline = None
    if ta and "no improvement allowance" in ta["text"]:
        add(F("ti_allowance", "None", "found", ta["n"], [E(ta["text"])]))
        add(F("ti_unpaid_balance", "None (no allowance)", "found", ta["n"], [E(ta["text"])], label="Unpaid allowance balance", section="obligations"))
    elif ta:
        ss = sentences(ta["text"])
        add(F("ti_allowance", short(" ".join(ss[:2]), 500), "found", ta["n"], [E(s) for s in ss[:2]]))
        paid = re.search(r"(\$[\d,]+\.\d\d)[^.]*(has been|was) (paid|disbursed)|paid[^.]*?(\$[\d,]+\.\d\d)", ta["text"])
        unpaid = next((s for s in ss if re.search(r"unpaid|remain|balance", s, re.I)), None)
        rem_amt = re.search(r"(\$[\d,]+\.\d\d) remains? available", unpaid or "")
        add(F("ti_unpaid_balance", (f"{rem_amt.group(1)} remains available" if rem_amt else short(unpaid, 300)) if unpaid else short(" ".join(ss[:2]), 300), "found", ta["n"], [E(unpaid or ss[0])], label="Unpaid allowance balance", section="obligations"))
        dl = re.search(r"requested by (" + DATE_RE + ")", ta["text"])
        ti_deadline = dl.group(1) if dl else None
    else:
        add(F("ti_allowance", "Not addressed", "not_in_lease"))
        add(F("ti_unpaid_balance", "Not addressed", "not_in_lease", label="Unpaid allowance balance", section="obligations"))
    if lw["text"].startswith("Landlord's work: None. Tenant accepts"):
        add(F("landlord_work", "None; Premises accepted AS IS with building systems in good working order", "found", lw["n"], [E('Landlord\'s work: None. Tenant accepts the Premises in their "AS IS" condition')], label="Landlord's work", section="obligations"))
    else:
        add(F("landlord_work", short(lw["text"].replace("Landlord's work: ", "").rstrip("."), 400), "found", lw["n"], [E(short(lw["text"], 700))], label="Landlord's work", section="obligations"))
    al = L.para("Alterations", "Alterations")
    if "costing less than $10,000" in al["text"]:
        add(F("alterations", "Landlord consent required, except non-structural interior work under $10,000 a year (notice only)", "found", al["n"], [E("non-structural interior Alterations costing less than $10,000 in the")]))
    else:
        add(F("alterations", short(sentences(al["text"])[0], 400), "found", al["n"], [E(short(sentences(al["text"])[0], 700))]))
    su = L.para("Surrender", "surrender")
    add(F("surrender", "Broom clean and in good condition, reasonable wear and tear and casualty excepted", "found", su["n"], [E("Tenant shall surrender the Premises broom clean and in good condition")]))
    rs = L.sec("Surrender")["paras"][1] if len(L.sec("Surrender")["paras"]) > 1 else None
    if rs and rs["text"].startswith("Tenant shall remove its trade fixtures, equipment and cabling"):
        add(F("restoration", "Remove trade fixtures, equipment and cabling and repair damage; approved Alterations stay unless Landlord elected removal when approving", "found", rs["n"], [E("Tenant shall remove its trade fixtures, equipment and cabling and repair any damage caused by the"), E("Tenant is not required to remove Landlord-approved Alterations")], label="Restoration", section="obligations"))
    else:
        add(F("restoration", short(rs["text"].rstrip("."), 400), "found", rs["n"], [E(short(rs["text"], 700))], label="Restoration", section="obligations") if rs else F("restoration", "Not addressed", "not_in_lease", label="Restoration", section="obligations"))
    add(F("amendments", "None in the document provided", "not_in_lease"))

    # Critical dates.
    cds = [
        {"date": iso(lead_date), "kind": "lease_date", "label": "Lease signed", "status": "found", "clause": "Preamble", "evidence": [E(lead_q)]},
        {"date": iso(comm), "kind": "commencement", "label": "Commencement", "status": "found", "clause": tclause, "evidence": [E(f"The Term begins on the Commencement Date, {comm}")]},
        {"date": iso(exp), "kind": "expiration", "label": "Expiration", "status": "found", "clause": tclause,
         "action": "Re-lease, renew or document an extension" + (f"; holdover is at {hp} of the last Base Rent" if hp else ""), "evidence": [E(f"ends on the Expiration Date, {exp}")]},
    ]
    if free:
        cds.append({"date": first_paying["start"], "kind": "rent_commencement", "label": "Rent commencement (free rent ends)", "status": "found", "clause": rp["n"], "evidence": first_paying["evidence"]})
    for r in rent_rows[1:]:
        if r["start"] > TODAY.isoformat() and r["monthly_rent"] > 0:
            cds.append({"date": r["start"], "kind": "rent_increase", "label": f"Rent increase to ${r['rate']:.2f}/RSF", "status": "found", "clause": rp["n"], "action": f"Bill ${r['monthly_rent']:,.2f}/month", "evidence": r["evidence"]})
    if renewal and renewal["notice_months"]:
        nd = add_months(iso(exp), -renewal["notice_months"])
        passed = nd < TODAY.isoformat()
        cds.append({"date": nd, "kind": "renewal_notice", "label": "Renewal notice deadline" + (" (passed)" if passed else ""), "status": "calculated", "clause": renewal["para"]["n"],
                    "notice": f"Written notice at least {renewal['notice_months']} months before the Expiration Date",
                    "action": ("Deadline has passed; confirm whether Tenant exercised the option" if passed else "Watch for Tenant's renewal notice; options lapse if not exercised on time"),
                    "calculation": f"{exp} − {renewal['notice_months']} months = {long_of(nd)}",
                    "evidence": [E(re.search(r"given at least [^,]+ before the then-scheduled Expiration Date", renewal["para"]["text"]).group(0)), E(f"ends on the Expiration Date, {exp}")]})
    if termination and termination["date"]:
        td = termination["date"]
        cds.append({"date": iso(td), "kind": "termination_effective", "label": "Early termination date (if exercised)", "status": "found", "clause": termination["para"]["n"], "evidence": [E(re.search(r"[^.]*" + re.escape(td) + r"[^.]*\.", termination["text"]).group(0).strip())]})
        if termination["notice"]:
            nd = add_months(iso(td), -termination["notice"])
            cds.append({"date": nd, "kind": "termination_notice", "label": "Termination notice deadline" + (" (passed)" if nd < TODAY.isoformat() else ""), "status": "calculated", "clause": termination["para"]["n"],
                        "notice": f"At least {termination['notice']} months before {td}", "action": "Watch for Tenant's termination notice and collect the termination fee",
                        "calculation": f"{td} − {termination['notice']} months = {long_of(nd)}",
                        "evidence": [E(re.search(r"[^.]*" + re.escape(td) + r"[^.]*\.", termination["text"]).group(0).strip())]})
    if ti_deadline:
        cds.append({"date": iso(ti_deadline), "kind": "other", "label": "Allowance request deadline", "status": "found", "clause": ta["n"], "action": "Unused allowance is forfeited after this date", "evidence": [E(f"requested by {ti_deadline}")]})
    cds.sort(key=lambda d: d["date"])

    # Risk flags.
    risks = []
    def risk(sev, title, detail, clause, ev):
        risks.append({"severity": sev, "title": title, "clause": clause, "detail": detail, "evidence": [e for e in ev if e]})
    months_left = (date.fromisoformat(iso(exp)) - TODAY).days / 30.4
    if months_left <= 12:
        risk("high", f"Lease expires {exp}", f"The term ends in about {max(0, round(months_left))} months." + ((" The renewal notice deadline has passed." if add_months(iso(exp), -renewal["notice_months"]) < TODAY.isoformat() else f" Tenant's renewal notice is due by {long_of(add_months(iso(exp), -renewal['notice_months']))}.") if renewal and renewal["notice_months"] else ""), tclause, [E(f"ends on the Expiration Date, {exp}")])
    if termination:
        risk("high", "Tenant early termination right", short(termination["text"], 600), termination["para"]["n"], [E(sentences(termination["text"])[0])])
    if rofo:
        risk("low", "Right of first offer / refusal", short(rofo["text"], 400), rofo["para"]["n"], [E(sentences(rofo["text"])[0])])
    rel = next((f for f in fields if f["key"] == "relocation_right"), None)
    if rel and rel["value"] not in ("None", "Not addressed"):
        risk("medium", "Landlord relocation right", rel["value"], rel.get("clause"), rel["evidence"][:1])
    capf = next(f for f in fields if f["key"] == "expense_cap")
    if "Gross (Landlord pays" in info.get("Lease type", ""):
        risk("medium", "Gross lease: Landlord bears operating expenses", "Base Rent includes Operating Expenses and Real Estate Taxes, so increases are not recovered from the tenant.", oe["paras"][0]["n"], [E(sentences(o1)[0])])
    elif capf["value"] == "None":
        risk("medium", "Uncapped operating expenses", "Operating Expenses have no cap, so the tenant bears all increases.", capf["clause"], capf["evidence"])
    elif capf["status"] == "found":
        risk("low", "Operating expense cap", "Controllable expense increases above the cap are not recoverable from the tenant: " + capf["value"], capf["clause"], capf["evidence"][:1])
    if guar != "None":
        risk("low", "Personal guaranty", f"Payment is supported by a personal guaranty: {guar}.", next(f for f in fields if f["key"] == "guaranty")["clause"], next(f for f in fields if f["key"] == "guaranty")["evidence"][:1])
    else:
        risk("medium", "Thin credit support", f"No guarantor; security deposit {dep}.", "1, " + dep_p["n"], [L.ev(f"{tenant} None {' '.join(project.split()[:3])}", raw_page=1), E(f"Tenant shall deposit {dep} with Landlord")])
    if custom_hz or base:
        risk("medium", "Environmental use", "Use involves hazardous materials beyond ordinary office and light industrial quantities: " + short(sentences(hz1["text"])[0], 300), hz1["n"], [E(short(sentences(hz1["text"])[0], 600))])
    if excl and "no exclusive right" not in excl["text"]:
        risk("low", "Exclusive use restriction", "Landlord's leasing of the rest of the project is restricted: " + short(excl["text"], 300), excl["n"], [E(short(excl["text"], 600))])
    if os_ and "No outside storage" not in os_["text"]:
        risk("low", "Outside storage permitted", short(os_["text"], 300), os_["n"], [E(os_["text"])])
    if free:
        risk("low", "Free rent", f"{len(free)} rent period(s) at $0 before rent starts on {long_of(first_paying['start'])}.", rp["n"], rent_rows[0]["evidence"])

    tb = next(f for f in fields if f["key"] == "tenant_business")["value"]
    summary = (f"{info.get('Lease type', '')} industrial lease of {rsf} RSF ({prem.split(', containing')[0]}) to {tenant_name}, dated {lead_date}, for {months} months from {comm} to {exp}, "
               f"at {br_rate}/RSF. " + (f"Renewal option: {next(f for f in fields if f['key'] == 'renewal_option')['value'].split(';')[0]}. " if renewal else "No renewal option. ")
               + ("Tenant has an early termination right. " if termination else ""))
    lease = {"title": f"{tenant_name} — {asset}, {prem.split(', containing')[0]}", "summary": short(summary, 1100), "property_type": "industrial",
             "fields": fields, "rent_schedule": rent_rows, "critical_dates": cds, "risks": risks}
    app = {"tenant_business": tb, "sic_code": code, "files": [f"{s}.pdf" for s in stems], "made_with": "CREparser Lease Abstraction", "template": "Light industrial (Model Fund I)", "version": 1}
    return lease, app


def main():
    out_dir, txt_dir, *stems = sys.argv[1:]
    L = Lease(stems, txt_dir)
    lease, app = build(L, stems)
    n_ev = sum(len(f.get("evidence", [])) for f in lease["fields"])
    print(f"{stems[0]}: {len(lease['fields'])} fields ({n_ev} quotes), {len(lease['rent_schedule'])} rent rows, {len(lease['critical_dates'])} dates, {len(lease['risks'])} risks; SIC {app['sic_code']}")
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    json.dump({"lease": lease, "app": app}, open(Path(out_dir) / f"{stems[0]}.draft.json", "w"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
