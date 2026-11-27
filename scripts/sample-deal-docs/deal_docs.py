"""Fictional deal documents for phase E (Documents tab) and their abstracts.

Writes docs/sample-deal-docs/deals/html/<name>.html and
docs/sample-deal-docs/deals/abstracts/<name>.json; print the PDFs with
  node scripts/sample-deal-docs/print_html.cjs docs/sample-deal-docs/deals
Every value's quote is a sentence of the document, so the abstracts pass the
app's local check (checkLocally) against the PDF text.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "docs" / "sample-deal-docs" / "deals"
# Model Fund I as the app builds it (export_fund.cjs). Every figure a document
# shares with the app is read from here (AGENTS.md: everything ties out); only
# facts the app does not hold are written in this file, and lib/sampleFund.js
# then reads them into the app from the abstracts (make_terms.cjs).
FUND = json.loads((Path(__file__).resolve().parent / "fund.json").read_text())
ASSET = {a["name"]: a for a in FUND["assets"]}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def long(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{MONTHS[m - 1]} {d}, {y}"


def add_years(iso, n):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{y + n:04d}-{m:02d}-{d:02d}"


def add_days(iso, n):
    from datetime import date, timedelta
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


AF = ASSET["Airport Flex Park"]
R9 = ASSET["Route 9 Small Bay"]
(OUT / "html").mkdir(parents=True, exist_ok=True)
(OUT / "abstracts").mkdir(parents=True, exist_ok=True)

CSS = ("body{font:11.5px/1.5 Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 4px}"
       "p{margin:4px 0}.banner{color:#b42318;font-weight:bold;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:12px}")
BANNER = '<div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>'


def build(name, title, sections, abstract):
    """sections: [(heading, [sentences])]; abstract fields reference sentences by text."""
    body = "".join(f"<h2>{h}</h2>" + "".join(f"<p>{s}</p>" for s in ps) for h, ps in sections)
    html = f'<html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{BANNER}<h1>{title}</h1>{body}<p style="color:#555">This document is fictional and was created for software testing.</p></body></html>'
    (OUT / "html" / f"{name}.html").write_text(html)
    text = " ".join(s for _, ps in sections for s in ps)
    for f in abstract.get("fields", []):
        for e in f.get("evidence", []):
            assert e["quote"] in text, (name, f["key"], e["quote"])
    abstract.setdefault("app", {}).update({"validated": False, "made_with": "Sample (fictional)", "files": [f"{name}.pdf"]})
    (OUT / "abstracts" / f"{name}.json").write_text(json.dumps(abstract, indent=1, ensure_ascii=False))


def F(key, value, quote, clause=None, status="found"):
    f = {"key": key, "value": value, "status": status, "evidence": [{"quote": quote, "page": 1}]}
    if clause:
        f["clause"] = clause
    return f


def D(date, label, quote, action="", clause=""):
    return {"date": date, "kind": "deadline", "label": label, "action": action, "clause": clause, "status": "found", "evidence": [{"quote": quote, "page": 1}]}


# ── Airport Flex Park: offering memo ───────────────────────────────────────
_occ = [u for u in AF["units"] if u["status"] == "occupied"]
_cap = AF["noiYear1Input"] / AF["price"] * 100
s = {
    "name": "The Property is Airport Flex Park, a multi-tenant flex industrial park.",
    "addr": f"The address is {AF['address']}, {AF['city']}, {AF['state']} {AF['zip']}.",
    "sf": f"The buildings contain {AF['sf']:,} rentable square feet in {AF['unitCount']} units.",
    "yb": "The Property was built in 1998 and renovated in 2017.",
    "price": f"The Seller is asking ${AF['price']:,} for the Property.",
    "noi": f"Underwritten year-one net operating income is ${AF['noiYear1Input']:,}.",
    "cap": f"The asking price reflects a {_cap:.2f}% cap rate on that income.",
    "occ": f"Tenants occupy {len(_occ)} of the {AF['unitCount']} units.",
}
build("airport-flex-om", "Airport Flex Park – Offering Memorandum", [
    ("Investment summary", [s["name"], s["addr"], s["sf"], s["yb"]]),
    ("Pricing", [s["price"], s["noi"], s["cap"]]),
    ("Occupancy", [s["occ"], "Tenants are local service, distribution and light industrial businesses."]),
], {
    "doc_type": "om", "title": "Airport Flex Park offering memo", "summary": f"Offering memo for Airport Flex Park, a {AF['sf']:,} SF, {AF['unitCount']}-unit flex park in {AF['city']}, asking ${AF['price']:,} ({_cap:.2f}% cap on ${AF['noiYear1Input']:,} of year-one NOI).",
    "fields": [F("property_name", "Airport Flex Park", s["name"]), F("address", AF["address"], s["addr"]), F("city", AF["city"], s["addr"]), F("state", AF["state"], s["addr"]),
               F("zip", AF["zip"], s["addr"]), F("square_feet", f"{AF['sf']:,}", s["sf"]), F("units", str(AF["unitCount"]), s["sf"]), F("year_built", "1998", s["yb"]),
               F("asking_price", f"${AF['price']:,}", s["price"]), F("in_place_noi", f"${AF['noiYear1Input']:,}", s["noi"]), F("cap_rate", f"{_cap:.2f}%", s["cap"])],
    "critical_dates": [],
})

# ── Rent roll (every unit, as in the app) ───────────────────────────────────
rr = []
for u in AF["units"]:
    if u["status"] == "occupied":
        rr.append((f"Unit {u['name']}: {u['tenant']}, {u['sf']:,} SF, occupied, {u['leaseType']}, ${u['rentPSF']:.2f} per SF, lease ends {u['leaseEnd']}, {u['escalationPct']:g}% escalations, {u['business'].lower()}.",
                   {"name": u["name"], "tenant": u["tenant"], "sf": u["sf"], "status": "occupied", "lease_type": u["leaseType"], "rent_psf": u["rentPSF"], "lease_end": u["leaseEnd"], "escalation_pct": u["escalationPct"], "business": u["business"]}))
    else:
        rr.append((f"Unit {u['name']}: vacant, {u['sf']:,} SF.", {"name": u["name"], "tenant": "", "sf": u["sf"], "status": "vacant"}))
_asof = long(AF["acquisitionDate"])
build("airport-flex-rent-roll", f"Airport Flex Park – Rent Roll as of {_asof}", [
    ("Summary", [f"Rent roll as of {_asof}.", f"Units shown: {len(rr)} of {AF['unitCount']}."]),
    ("Units", [x[0] for x in rr]),
], {
    "doc_type": "rent_roll", "title": "Airport Flex Park rent roll", "summary": f"The rent roll at closing: all {AF['unitCount']} units, {len(_occ)} occupied.",
    "fields": [F("as_of", _asof, f"Rent roll as of {_asof}.")],
    "units": [x[1] for x in rr], "critical_dates": [],
})

# ── T-12 ────────────────────────────────────────────────────────────────────
_x = AF["expensesPSF"]
_rent, _rec = 470000, 52000
_oth = round(_x["otherIncome"] * AF["sf"])
_rev = _rent + _oth + _rec
_tax, _ins, _util, _rm, _jan = (round(_x[k] * AF["sf"]) for k in ("realEstateTax", "insurance", "utilities", "maintenance", "janitorial"))
_mg = round(_rev * AF["managementFeePct"] / 100)
_tot = _tax + _ins + _util + _rm + _jan + _mg
t = {
    "per": "Operating statement for the twelve months ended December 31, 2025.",
    "rent": f"Base rent: ${_rent:,}.", "oth": f"Other income: ${_oth:,}.", "rec": f"Expense recoveries: ${_rec:,}.",
    "tax": f"Real estate taxes: ${_tax:,}.", "ins": f"Insurance: ${_ins:,}.", "util": f"Utilities: ${_util:,}.", "rm": f"Repairs and maintenance: ${_rm:,}.",
    "jan": f"Janitorial: ${_jan:,}.", "mgmt": f"Management fee: ${_mg:,}.", "tot": f"Total operating expenses: ${_tot:,}.", "noi": f"Net operating income: ${_rev - _tot:,}.",
}
build("airport-flex-t12", "Airport Flex Park – Trailing Twelve Months", [
    ("Period", [t["per"]]), ("Income", [t["rent"], t["oth"], t["rec"]]),
    ("Expenses", [t["tax"], t["ins"], t["util"], t["rm"], t["jan"], t["mgmt"], t["tot"]]), ("Result", [t["noi"]]),
], {
    "doc_type": "t12", "title": "Airport Flex Park T-12 (2025)", "summary": f"Seller's operating statement for 2025: ${_rev:,} revenue, ${_tot:,} expenses, ${_rev - _tot:,} NOI.",
    "fields": [F("period_end", "December 31, 2025", t["per"]), F("gross_rent", f"${_rent:,}", t["rent"]), F("other_income", f"${_oth:,}", t["oth"]), F("recoveries", f"${_rec:,}", t["rec"]),
               F("real_estate_taxes", f"${_tax:,}", t["tax"]), F("insurance", f"${_ins:,}", t["ins"]), F("utilities", f"${_util:,}", t["util"]), F("repairs_maintenance", f"${_rm:,}", t["rm"]),
               F("janitorial", f"${_jan:,}", t["jan"]), F("management_fee", f"${_mg:,}", t["mgmt"]), F("total_expenses", f"${_tot:,}", t["tot"]), F("noi", f"${_rev - _tot:,}", t["noi"])],
    "critical_dates": [],
})

# ── LOI ─────────────────────────────────────────────────────────────────────
l = {
    "date": "This letter of intent is dated October 20, 2025.",
    "parties": "The Buyer is Model Fund I – Airport Flex LLC and the Seller is Runway Vista Holdings LP.",
    "price": f"The purchase price is ${AF['price']:,}.", "dep": "Buyer will deposit $150,000 in escrow within three business days of the PSA.",
    "dd": "Buyer will have a due diligence period of 45 days.", "close": "Closing will occur 30 days after the end of due diligence.",
    "fin": "There is no financing contingency.", "exp": "This letter expires if not countersigned by October 27, 2025.",
}
build("airport-flex-loi", "Letter of Intent – Airport Flex Park", [
    ("Terms", [l["date"], l["parties"], l["price"], l["dep"], l["dd"], l["close"], l["fin"]]), ("Expiration", [l["exp"]]),
], {
    "doc_type": "loi", "title": "Airport Flex Park LOI", "summary": f"Non-binding LOI at ${AF['price']:,} with a $150,000 deposit, 45 days of due diligence and closing 30 days later, no financing contingency.",
    "fields": [F("loi_date", "October 20, 2025", l["date"]), F("buyer", "Model Fund I – Airport Flex LLC", l["parties"]), F("seller", "Runway Vista Holdings LP", l["parties"]),
               F("purchase_price", f"${AF['price']:,}", l["price"]), F("deposit", "$150,000", l["dep"]), F("dd_days", "45 days", l["dd"]), F("closing_days", "30 days", l["close"]),
               F("financing_contingency", "None", l["fin"])],
    "critical_dates": [D("2025-10-27", "LOI countersignature deadline", l["exp"], "Countersign or the LOI lapses")],
})

# ── PSA ─────────────────────────────────────────────────────────────────────
p = {
    "date": "This Purchase and Sale Agreement is effective as of November 14, 2025.",
    "price": "The Purchase Price is $7,200,000.", "dep1": "Buyer shall deliver an Initial Deposit of $150,000.",
    "dep2": "Upon expiration of the Due Diligence Period Buyer shall deliver an Additional Deposit of $100,000.",
    "dd": "The Due Diligence Period expires on December 29, 2025, and the Deposits become non-refundable on December 29, 2025.",
    "title": "Buyer shall deliver title objections by December 5, 2025.", "survey": "Buyer shall deliver survey objections by December 12, 2025.",
    "close": "Closing shall occur on January 30, 2026.", "ext": "Buyer may extend Closing once by 15 days on 5 business days' notice with an additional $50,000 deposit.",
    "est": "Seller shall deliver tenant estoppels from tenants leasing at least 75% of the leased square feet no later than 10 days before Closing.",
    "reps": "Seller's representations survive Closing for 9 months.", "cap": "Seller's liability for breach of representations is capped at $216,000.",
    "assign": "Buyer may assign this Agreement to an affiliate without Seller's consent.", "def": "If Seller defaults, Buyer may seek specific performance or a refund of the Deposits.",
}
build("airport-flex-psa", "Purchase and Sale Agreement – Airport Flex Park", [
    ("1. Price and deposits", [p["date"], p["price"], p["dep1"], p["dep2"]]), ("2. Due diligence", [p["dd"], p["title"], p["survey"]]),
    ("3. Closing", [p["close"], p["ext"], p["est"]]), ("4. Representations", [p["reps"], p["cap"]]), ("5. Other", [p["assign"], p["def"]]),
], {
    "doc_type": "psa", "title": "Airport Flex Park PSA", "summary": "PSA at $7,200,000 with $250,000 in deposits going hard on December 29, 2025 and closing January 30, 2026.",
    "fields": [F("psa_date", "November 14, 2025", p["date"], "Preamble"), F("purchase_price", "$7,200,000", p["price"], "1"), F("initial_deposit", "$150,000", p["dep1"], "1"),
               F("additional_deposit", "$100,000", p["dep2"], "1"), F("deposit_hard_date", "December 29, 2025", p["dd"], "2"), F("dd_expiry", "December 29, 2025", p["dd"], "2"),
               F("title_objection_date", "December 5, 2025", p["title"], "2"), F("survey_objection_date", "December 12, 2025", p["survey"], "2"),
               F("closing_date", "January 30, 2026", p["close"], "3"), F("extension", "Once by 15 days on 5 business days' notice with an additional $50,000 deposit", p["ext"], "3"),
               F("estoppels", "Tenants leasing at least 75% of leased SF, no later than 10 days before Closing", p["est"], "3"), F("reps_survival_months", "9 months", p["reps"], "4"),
               F("reps_cap", "$216,000", p["cap"], "4"), F("assignment", "To an affiliate without Seller's consent", p["assign"], "5"),
               F("default_remedies", "Specific performance or refund of the Deposits", p["def"], "5")],
    "critical_dates": [D("2025-12-05", "Title objections due", p["title"], "Deliver title objections", "2"), D("2025-12-12", "Survey objections due", p["survey"], "Deliver survey objections", "2"),
                       D("2025-12-29", "Due diligence expires; deposits go hard", p["dd"], "Terminate or deliver the Additional Deposit", "2"),
                       D("2026-01-30", "Closing", p["close"], "Close or extend", "3")],
})

# ── IC memo ─────────────────────────────────────────────────────────────────
_m = AF["model"]
m = {
    "appr": "The Investment Committee approved the acquisition on December 18, 2025.",
    "who": "Approved by the Investment Committee: A. Sample, B. Example and C. Placeholder.",
    "price": f"Approved purchase price: ${AF['price']:,}.", "cost": f"Total cost including closing costs and capex: ${_m['totalCost']:,}.",
    "loan": f"Senior loan: ${AF['loan']['amount']:,}.", "eq": f"Equity: ${_m['equity']:,}.", "noi": f"Year-1 NOI: ${_m['noi1']:,}.",
    "gic": f"Going-in cap rate: {_m['goingInCapPct']:.2f}%.", "xc": f"Exit cap rate: {AF['exitCapPct']:.2f}%.", "irr": f"Projected IRR: {_m['irrPct']:.1f}%.", "em": f"Projected equity multiple: {_m['multiple']:.2f}x.",
    "hold": f"Hold period: {AF['holdYears']} years.", "capex": f"Capex budget: ${AF['capex']:,}.",
    "c1": "Condition 1: Phase I environmental report with no recognized environmental conditions by January 15, 2026.",
    "c2": "Condition 2: Lender term sheet at 65% LTV or better by January 10, 2026.",
    "c3": "Condition 3: Tenant estoppels from at least 75% of leased square feet by January 20, 2026.",
    "c4": "Condition 4: Asset management plan presented to the Committee by April 30, 2026.",
}
build("airport-flex-ic-memo", "Final Investment Committee Memo – Airport Flex Park", [
    ("Approval", [m["appr"], m["who"]]), ("Approved terms", [m["price"], m["cost"], m["loan"], m["eq"], m["noi"], m["gic"], m["xc"], m["irr"], m["em"], m["hold"], m["capex"]]),
    ("Conditions of approval", [m["c1"], m["c2"], m["c3"], m["c4"]]),
], {
    "doc_type": "ic_memo", "title": "Airport Flex Park final IC memo", "summary": f"IC approved Airport Flex Park on December 18, 2025 at ${AF['price']:,} ({_m['irrPct']:.1f}% IRR, {_m['multiple']:.2f}x) subject to four conditions.",
    "fields": [F("approval_date", "December 18, 2025", m["appr"]), F("approvers", "A. Sample, B. Example and C. Placeholder", m["who"]), F("price", f"${AF['price']:,}", m["price"]),
               F("total_cost", f"${_m['totalCost']:,}", m["cost"]), F("loan", f"${AF['loan']['amount']:,}", m["loan"]), F("equity", f"${_m['equity']:,}", m["eq"]), F("noi1", f"${_m['noi1']:,}", m["noi"]),
               F("going_in_cap", f"{_m['goingInCapPct']:.2f}%", m["gic"]), F("exit_cap", f"{AF['exitCapPct']:.2f}%", m["xc"]), F("irr", f"{_m['irrPct']:.1f}%", m["irr"]), F("multiple", f"{_m['multiple']:.2f}x", m["em"]),
               F("hold_years", f"{AF['holdYears']} years", m["hold"]), F("capex", f"${AF['capex']:,}", m["capex"])],
    "conditions": [{"text": "Phase I environmental report with no recognized environmental conditions", "deadline": "2026-01-15"},
                   {"text": "Lender term sheet at 65% LTV or better", "deadline": "2026-01-10"},
                   {"text": "Tenant estoppels from at least 75% of leased square feet", "deadline": "2026-01-20"},
                   {"text": "Asset management plan presented to the Committee", "deadline": "2026-04-30"}],
    "critical_dates": [D("2025-12-18", "IC approval", m["appr"]), D("2026-04-30", "IC condition: asset management plan due", m["c4"], "Present the asset management plan to IC")],
})

# ── Closing statement (acquisition) ─────────────────────────────────────────
_cred, _pro, _dep = 45000, 12350, 26400
_cash = AF["price"] + AF["closingCosts"] - AF["loan"]["amount"] - _cred - _pro - _dep
_cd = long(AF["acquisitionDate"])
c = {
    "date": f"Settlement date: {_cd}.", "price": f"Contract sales price: ${AF['price']:,}.", "cred": f"Seller credit for roof repairs: ${_cred:,}.",
    "pro": f"Rent and tax prorations credited to Buyer: ${_pro:,}.", "dep": f"Tenant security deposits transferred to Buyer: ${_dep:,}.",
    "cc": f"Buyer's closing costs (title, escrow, legal, lender fees): ${AF['closingCosts']:,}.", "loan": f"New loan proceeds: ${AF['loan']['amount']:,}.", "eq": f"Cash from Buyer at closing: ${_cash:,}.",
}
build("airport-flex-closing-acq", "Settlement Statement – Airport Flex Park (Acquisition)", [("Settlement", list(c.values()))], {
    "doc_type": "closing_acq", "title": "Airport Flex Park acquisition settlement statement", "summary": f"Closed {_cd} at ${AF['price']:,}; ${AF['closingCosts']:,} buyer closing costs; ${AF['loan']['amount']:,} loan; ${_cash:,} cash from buyer.",
    "fields": [F("closing_date", _cd, c["date"]), F("contract_price", f"${AF['price']:,}", c["price"]), F("seller_credits", f"${_cred:,}", c["cred"]), F("prorations", f"${_pro:,}", c["pro"]),
               F("deposits_transferred", f"${_dep:,}", c["dep"]), F("closing_costs", f"${AF['closingCosts']:,}", c["cc"]), F("loan_proceeds", f"${AF['loan']['amount']:,}", c["loan"]), F("equity_funded", f"${_cash:,}", c["eq"])],
    "critical_dates": [],
})

# ── Insurance certificates ──────────────────────────────────────────────────
o = {
    "ins": "Named insured: Model Fund I – Airport Flex LLC.", "hold": f"Certificate holder: {AF['loan']['lender']}, its successors and assigns, as mortgagee.",
    "co": "Insurer: Fictional Mutual Insurance Company, rated A (Excellent).", "date": "Certificate date: January 28, 2026.",
    "prop": "Property (all risk), policy PR-55120: limit $7,800,000, deductible $25,000, effective January 30, 2026, expires January 30, 2027.",
    "gl": "General liability, policy GL-55121: $1,000,000 each occurrence, $2,000,000 aggregate, effective January 15, 2026, expires January 15, 2027.",
    "umb": "Umbrella, policy UM-55122: limit $5,000,000, effective January 15, 2026, expires January 15, 2027.",
}
build("airport-flex-insurance-owner", "Certificate of Liability and Property Insurance (Owner)", [("Certificate", list(o.values()))], {
    "doc_type": "insurance_cert", "title": "Owner policies 2026", "summary": "Owner's property, general liability and umbrella policies for Airport Flex Park.",
    "fields": [F("insured", "Model Fund I – Airport Flex LLC", o["ins"]), F("holder", f"{AF['loan']['lender']}, as mortgagee", o["hold"]), F("insurer", "Fictional Mutual Insurance Company", o["co"]),
               F("insurer_rating", "A (Excellent)", o["co"]), F("cert_date", "January 28, 2026", o["date"])],
    "policies": [
        {"coverage": "property", "policy_no": "PR-55120", "limit": 7800000, "deductible": 25000, "effective": "2026-01-30", "expiry": "2027-01-30", "evidence": [{"quote": o["prop"]}]},
        {"coverage": "cgl", "policy_no": "GL-55121", "per_occurrence": 1000000, "aggregate": 2000000, "effective": "2026-01-15", "expiry": "2027-01-15", "additional_insured": False, "evidence": [{"quote": o["gl"]}]},
        {"coverage": "umbrella", "policy_no": "UM-55122", "limit": 5000000, "effective": "2026-01-15", "expiry": "2027-01-15", "evidence": [{"quote": o["umb"]}]},
    ],
    "critical_dates": [],
})
tn = {
    "ins": "Named insured: Desert Aero Parts LLC.", "hold": "Certificate holder: Model Fund I – Airport Flex LLC, as landlord and additional insured.",
    "co": "Insurer: Fictional Casualty Group, rated A- (Excellent).", "date": "Certificate date: March 3, 2026.",
    "gl": "General liability, policy CG-88410: $1,000,000 each occurrence, $2,000,000 aggregate, landlord is additional insured, waiver of subrogation applies, expires March 1, 2027.",
    "umb": "Umbrella, policy CU-88411: limit $1,000,000, expires March 1, 2027.",
    "auto": "Business auto, policy CA-88412: combined single limit $1,000,000, expires March 1, 2027.",
    "wc": "Workers' compensation, policy WC-88413: statutory limits, expires March 1, 2027.",
}
build("airport-flex-insurance-desert-aero", "Certificate of Liability Insurance (Tenant: Desert Aero Parts)", [("Certificate", list(tn.values()))], {
    "doc_type": "insurance_cert", "title": "Desert Aero Parts 2026–27", "summary": "Tenant certificate for Desert Aero Parts; the umbrella ($1,000,000) is below the lease's $2,000,000.",
    "fields": [F("insured", "Desert Aero Parts LLC", tn["ins"]), F("holder", "Model Fund I – Airport Flex LLC, as landlord and additional insured", tn["hold"]),
               F("insurer", "Fictional Casualty Group", tn["co"]), F("insurer_rating", "A- (Excellent)", tn["co"]), F("cert_date", "March 3, 2026", tn["date"])],
    "policies": [
        {"coverage": "cgl", "policy_no": "CG-88410", "per_occurrence": 1000000, "aggregate": 2000000, "expiry": "2027-03-01", "additional_insured": True, "waiver_of_subrogation": True, "evidence": [{"quote": tn["gl"]}]},
        {"coverage": "umbrella", "policy_no": "CU-88411", "limit": 1000000, "expiry": "2027-03-01", "evidence": [{"quote": tn["umb"]}]},
        {"coverage": "auto", "policy_no": "CA-88412", "limit": 1000000, "expiry": "2027-03-01", "evidence": [{"quote": tn["auto"]}]},
        {"coverage": "workers_comp", "policy_no": "WC-88413", "limit": "statutory", "expiry": "2027-03-01", "evidence": [{"quote": tn["wc"]}]},
    ],
    "critical_dates": [],
})

# (1.1.13: the Route 9 "test sale" settlement statement is gone. Model Fund I
# holds no closed sale, so a closing statement for one could not tie out.)

# ── Model Fund I LPA and PPM ────────────────────────────────────────────────
lp = {
    "fund": "This Limited Partnership Agreement governs Model Fund I, L.P.",
    "cmt": "Aggregate Commitments: $100,000,000.", "gp": "The General Partner commits 5% of Aggregate Commitments.",
    "fee": "The Management Fee is 1.5% per year of Commitments during the Investment Period and of Invested Capital thereafter.",
    "pref": "Limited Partners receive a Preferred Return of 9% per year.", "cu": "The General Partner catch-up is 100% until it has received 20% of the profits distributed.",
    "promote": "After the catch-up, distributions are split 80% to the Limited Partners and 20% to the General Partner until the Limited Partners have achieved a 12% IRR; then 70% and 30% until they have achieved an 18% IRR; and thereafter 60% and 40%.",
    "tm": "Each split applies only to the distributions made within its tier, and no split applies retroactively to distributions already made.",
    "ip": "The Investment Period is 2 years from the Final Closing.", "term": "The Partnership's term is 5 years from the Final Closing.",
    "ext": "The General Partner may extend the term by up to 2 extensions of 1 year each.", "sub": "Borrowings under a subscription facility may not exceed 80% of unfunded Commitments.",
    "l1": "Section 6.2(a): No single Investment may exceed 20% of Aggregate Commitments.",
    "l2": "Section 6.2(b): No single tenant may account for more than 10% of the Partnership's aggregate base rent.",
    "l3": "Section 6.2(c): Investments in any one state may not exceed 35% of aggregate gross asset value.",
    "l4": "Section 6.2(d): Investments in any one metropolitan area may not exceed 25% of aggregate gross asset value.",
    "l5": "Section 6.2(e): The Partnership invests only in industrial and flex properties.",
    "l6": "Section 6.2(f): Development and other non-core Investments may not exceed 15% of Aggregate Commitments.",
    "l7": "Section 6.3(a): Aggregate leverage may not exceed 65% of aggregate gross asset value.",
    "l8": "Section 6.3(b): Leverage on any single Investment may not exceed 75% of its value.",
}


def L(key, label, limit, unit, quote, clause):
    return {"key": key, "label": label, "limit": limit, "unit": unit, "basis": "", "clause": clause, "evidence": [{"quote": quote, "page": 1}]}


build("model-fund-i-lpa", "Limited Partnership Agreement – Model Fund I, L.P. (excerpt)", [
    ("Article 1", [lp["fund"], lp["cmt"], lp["gp"]]), ("Article 4. Fees and distributions", [lp["fee"], lp["pref"], lp["cu"], lp["promote"], lp["tm"]]),
    ("Article 5. Term", [lp["ip"], lp["term"], lp["ext"], lp["sub"]]), ("Article 6. Investment limitations", [lp[f"l{i}"] for i in range(1, 9)]),
], {
    "doc_type": "lpa", "title": "Model Fund I LPA (excerpt)", "summary": "Model Fund I: $100M commitments, 1.5% fee, 9% pref, 100% catch-up, 2-year investment period, 5-year term plus two 1-year extensions, and eight investment limits.",
    "fields": [F("fund_name", "Model Fund I, L.P.", lp["fund"]), F("commitments", "$100,000,000", lp["cmt"]), F("gp_commit_pct", "5%", lp["gp"]), F("mgmt_fee_pct", "1.5%", lp["fee"]),
               F("mgmt_fee_basis", "Commitments during the Investment Period, then Invested Capital", lp["fee"]), F("pref_pct", "9%", lp["pref"]), F("catch_up_pct", "100%", lp["cu"]),
               F("promote", "80/20 to a 12% IRR; 70/30 to an 18% IRR; 60/40 thereafter", lp["promote"]), F("tier_method", "Marginal", lp["tm"]), F("investment_period_years", "2 years", lp["ip"]),
               F("term_years", "5 years", lp["term"]), F("extension_count", "2", lp["ext"]), F("extension_years", "1 year", lp["ext"]), F("sub_line_pct", "80%", lp["sub"])],
    "limits": [L("single_asset_pct", "Single investment, % of commitments", 20, "%", lp["l1"], "6.2(a)"), L("single_tenant_pct", "Single tenant, % of base rent", 10, "%", lp["l2"], "6.2(b)"),
               L("state_pct", "Single state, % of gross asset value", 35, "%", lp["l3"], "6.2(c)"), L("metro_pct", "Single metro, % of gross asset value", 25, "%", lp["l4"], "6.2(d)"),
               L("property_type", "Permitted property types", "Industrial and flex", "text", lp["l5"], "6.2(e)"), L("non_core_pct", "Development / non-core, % of commitments", 15, "%", lp["l6"], "6.2(f)"),
               L("fund_ltv_pct", "Aggregate leverage, % of gross asset value", 65, "%", lp["l7"], "6.3(a)"), L("asset_ltv_pct", "Single-investment leverage", 75, "%", lp["l8"], "6.3(b)")],
    "critical_dates": [],
})
pp = {
    "fund": "This Private Placement Memorandum describes an offering of interests in Model Fund I, L.P.",
    "target": "The Partnership is targeting Aggregate Commitments of $100,000,000.",
    "fee": "Limited Partners will pay a Management Fee of 1.5% per year.", "pref": "The Preferred Return is 9% per year.",
    "strategy": "The Partnership will acquire small-bay industrial and flex properties in the western and southwestern United States.",
    "conc": "The Partnership will not invest more than 35% of its gross asset value in any one state.",
}
build("model-fund-i-ppm", "Private Placement Memorandum – Model Fund I, L.P. (excerpt)", [("Summary of terms", [pp["fund"], pp["target"], pp["fee"], pp["pref"]]), ("Strategy and limits", [pp["strategy"], pp["conc"]])], {
    "doc_type": "ppm", "title": "Model Fund I PPM (excerpt)", "summary": "PPM for Model Fund I: $100M target, 1.5% fee, 9% pref, small-bay industrial and flex in the West and Southwest, 35% state limit.",
    "fields": [F("fund_name", "Model Fund I, L.P.", pp["fund"]), F("commitments", "$100,000,000", pp["target"]), F("mgmt_fee_pct", "1.5%", pp["fee"]), F("pref_pct", "9%", pp["pref"])],
    "limits": [L("state_pct", "Single state, % of gross asset value", 35, "%", pp["conc"], "Strategy and limits")],
    "critical_dates": [],
})
# ── Loan agreements and rate cap confirmations (phase F) ────────────────────
CAP_MAX_STRIKE = 4.00  # the lender's maximum strike on SOFR; both executed caps are under it


def loan_doc(name, A):
    ln = A["loan"]
    prop, amount, spread, ext_fee, lender = A["name"], ln["amount"], ln["spreadPct"], ln["extensionFee"], ln["lender"]
    date_iso = A["acquisitionDate"]
    maturity_iso = add_years(date_iso, ln["termYears"])
    notice_iso = add_days(maturity_iso, -ln["extensionNoticeDays"])
    date_long, maturity_long = long(date_iso), long(maturity_iso)
    yrs = {1: "one year", 2: "two years", 3: "three years", 4: "four years", 5: "five years"}[ln["termYears"]]
    cnt = {1: "one extension", 2: "two successive extensions"}[ln["extensionCount"]]
    q = {
        "parties": f"This Loan Agreement is made as of {date_long} between {lender} (Lender) and the Borrower, the owner of {prop}.",
        "amt": f"The Loan is in the principal amount of ${amount:,}.",
        "rate": f"Interest accrues at Term SOFR plus {spread:.2f}% per year, with Term SOFR not less than 0.50%.",
        "mat": f"The Initial Maturity Date is {maturity_long}, {yrs} after closing.",
        "ext": f"Borrower may extend the Maturity Date by {cnt} of {ln['extensionTermYears']} year each, each on payment of an extension fee of ${ext_fee:,}.",
        "extc": f"Each extension requires written notice at least {ln['extensionNoticeDays']} days before the then Maturity Date, a debt service coverage ratio of at least {ln['dscrMin']:.2f}x and a replacement rate cap.",
        "io": f"Payments are interest only for {ln['ioYears']} years, then principal is amortized on a {ln['amortizationYears']}-year schedule.",
        "cap": f"Borrower shall maintain an interest rate cap with a strike not greater than {CAP_MAX_STRIKE:.2f}% on Term SOFR, a notional amount not less than the outstanding principal, and a term of at least 1 year.",
        "capr": "The cap provider must be rated A or better by S&P, and Borrower shall deliver a replacement cap at least 30 days before the existing cap expires.",
        "dscr": f"Borrower shall maintain a debt service coverage ratio of not less than {ln['dscrMin']:.2f}x, tested quarterly on the trailing three months annualized.",
        "cure": "Borrower may cure a covenant failure within 10 business days by a principal paydown or a cash collateral deposit.",
        "prep": "The Loan may be prepaid in whole after 12 months; before then a 1% exit fee applies.",
        "res": "Borrower shall fund monthly tax and insurance escrows.",
        "rep": "Borrower shall deliver quarterly operating statements within 45 days after each quarter and annual statements within 120 days after each year.",
    }
    build(name, f"Loan Agreement – {prop} (excerpt)", [
        ("1. The loan", [q["parties"], q["amt"], q["rate"]]), ("2. Term", [q["mat"], q["ext"], q["extc"], q["io"]]), ("3. Rate cap", [q["cap"], q["capr"]]),
        ("4. Financial covenants", [q["dscr"], q["cure"]]), ("5. Other", [q["prep"], q["res"], q["rep"]]),
    ], {
        "doc_type": "loan", "title": f"{prop} loan agreement", "summary": f"${amount:,} floating-rate loan from {lender} at Term SOFR + {spread:.2f}% (0.50% floor), maturing {maturity_long} with {ln['extensionCount']} {ln['extensionTermYears']}-year extensions; rate cap and a {ln['dscrMin']:.2f}x DSCR covenant.",
        "fields": [F("lender", lender, q["parties"], "1"), F("loan_date", date_long, q["parties"], "1"), F("loan_amount", f"${amount:,}", q["amt"], "1"),
                   F("index", "Term SOFR", q["rate"], "1"), F("spread_pct", f"{spread:.2f}%", q["rate"], "1"), F("floor_pct", "0.50%", q["rate"], "1"),
                   F("maturity_date", maturity_long, q["mat"], "2"), F("initial_term_years", f"{ln['termYears']} years", q["mat"], "2"), F("extension_count", str(ln["extensionCount"]), q["ext"], "2"),
                   F("extension_term_years", f"{ln['extensionTermYears']} year", q["ext"], "2"), F("extension_fee", f"${ext_fee:,}", q["ext"], "2"),
                   F("extension_conditions", f"Notice at least {ln['extensionNoticeDays']} days before maturity, DSCR of at least {ln['dscrMin']:.2f}x and a replacement rate cap", q["extc"], "2"),
                   F("io_years", f"{ln['ioYears']} years", q["io"], "2"), F("amortization_years", f"{ln['amortizationYears']} years", q["io"], "2"),
                   F("cap_strike_pct", f"{CAP_MAX_STRIKE:.2f}%", q["cap"], "3"), F("cap_term", "At least 1 year", q["cap"], "3"), F("cap_min_rating", "A", q["capr"], "3"),
                   F("cap_replacement_days", "30 days", q["capr"], "3"), F("dscr_covenant", f"{ln['dscrMin']:.2f}x", q["dscr"], "4"),
                   F("covenant_testing", "Quarterly on the trailing three months annualized", q["dscr"], "4"),
                   F("cure", "Within 10 business days by a principal paydown or a cash collateral deposit", q["cure"], "4"),
                   F("prepayment", "In whole after 12 months; 1% exit fee before then", q["prep"], "5"),
                   F("reserves", "Monthly tax and insurance escrows", q["res"], "5"),
                   F("reporting", "Quarterly within 45 days; annual within 120 days", q["rep"], "5")],
        "critical_dates": [D(maturity_iso, "Initial maturity", q["mat"], "Repay or extend", "2"),
                           {"date": notice_iso, "kind": "deadline", "label": "First extension notice deadline", "action": "Give written notice to extend", "clause": "2", "status": "calculated",
                            "calculation": f"{maturity_long} − {ln['extensionNoticeDays']} days = {long(notice_iso)}", "evidence": [{"quote": q["extc"], "page": 1}]}],
    })


loan_doc("airport-flex-loan", AF)
loan_doc("route9-loan", R9)


def cap_doc(name, A, rating, ref):
    ln = A["loan"]
    prop, cp, notional, strike, premium = A["name"], ln["capProvider"], ln["amount"], ln["capStrikePct"], ln["capPremium"]
    eff_iso = A["acquisitionDate"]
    trade_long, eff_long, term_long = long(add_days(eff_iso, -4)), long(eff_iso), long(add_years(eff_iso, ln["capTermYears"]))
    q = {
        "cp": f"This Confirmation sets out the terms of the interest rate cap entered into between {cp} (Party A) and the owner of {prop} (Party B), reference {ref}.",
        "rt": f"Party A is rated {rating} by S&P.",
        "trade": f"Trade Date: {trade_long}.", "eff": f"Effective Date: {eff_long}.", "term": f"Termination Date: {term_long}.",
        "notional": f"Notional Amount: ${notional:,}.", "index": "Floating Rate Option: USD Term SOFR, 1 month.",
        "strike": f"Cap Rate: {strike:.2f}%.", "prem": f"Fixed Amount (premium): ${premium:,}, payable by Party B on the Effective Date.",
        "dc": "Floating Rate Day Count Fraction: Actual/360.", "agent": f"Calculation Agent: {cp}.",
        "assign": f"Party B has collaterally assigned its rights under this Transaction to {ln['lender']}, as Lender.",
    }
    build(name, f"Interest Rate Cap Confirmation – {prop}", [("General terms", [q["cp"], q["rt"], q["trade"], q["eff"], q["term"], q["notional"]]),
                                                            ("Floating amounts", [q["index"], q["strike"], q["dc"]]), ("Premium and other", [q["prem"], q["agent"], q["assign"]])], {
        "doc_type": "rate_cap", "title": f"{prop} cap {eff_long[-4:]}", "summary": f"Executed {strike:.2f}% Term SOFR cap from {cp} ({rating}) on ${notional:,}, {eff_long} to {term_long}, premium ${premium:,}.",
        "fields": [F("counterparty", cp, q["cp"]), F("counterparty_rating", rating, q["rt"]), F("trade_date", trade_long, q["trade"]), F("effective_date", eff_long, q["eff"]),
                   F("termination_date", term_long, q["term"]), F("notional", f"${notional:,}", q["notional"]), F("index", "1-month Term SOFR", q["index"]),
                   F("strike_pct", f"{strike:.2f}%", q["strike"]), F("premium", f"${premium:,}", q["prem"]), {**F("payment_date", eff_long, q["prem"]), "evidence": [{"quote": q["prem"], "page": 1}, {"quote": q["eff"], "page": 1}]},
                   F("day_count", "Actual/360", q["dc"]), F("calculation_agent", cp, q["agent"]), F("assigned_to", ln["lender"], q["assign"])],
        "critical_dates": [],
    })


cap_doc("airport-flex-cap-2026", AF, "A+", "ADB-26-0130")
cap_doc("route9-cap-2026", R9, "A+", "ADB-26-0316")
print("phase F docs ok")
# ── Appraisals (phase G) ────────────────────────────────────────────────────
def appraisal_doc(name, prop, firm, eff_long, rep_long, value, cap, noi, vi, vs, vc):
    q = {
        "firm": f"This appraisal of {prop} was prepared by {firm}.",
        "int": "The interest appraised is the leased fee interest.",
        "eff": f"The effective date of value is {eff_long}.", "rep": f"The date of the report is {rep_long}.",
        "val": f"The market value of the leased fee interest, as is, is ${value:,}.",
        "cap": f"A direct capitalization rate of {cap:.2f}% was applied to stabilized net operating income of ${noi:,}.",
        "vi": f"Income capitalization approach: ${vi:,}.", "vs": f"Sales comparison approach: ${vs:,}.", "vc": f"Cost approach: ${vc:,}.",
        "app": "The income capitalization and sales comparison approaches were developed; the cost approach was given little weight.",
    }
    build(name, f"Appraisal Report – {prop} (excerpt)", [("Assignment", [q["firm"], q["int"], q["eff"], q["rep"]]), ("Conclusion", [q["val"], q["cap"]]),
                                                         ("Approaches", [q["vi"], q["vs"], q["vc"], q["app"]])], {
        "doc_type": "appraisal", "title": f"{prop} appraisal {eff_long}", "summary": f"{firm}: as-is market value ${value:,} as of {eff_long} at a {cap:.2f}% cap on ${noi:,} NOI.",
        "fields": [F("appraiser", firm, q["firm"]), F("effective_date", eff_long, q["eff"]), F("report_date", rep_long, q["rep"]), F("interest", "Leased fee", q["int"]),
                   F("value", f"${value:,}", q["val"]), F("cap_rate", f"{cap:.2f}%", q["cap"]), F("noi", f"${noi:,}", q["cap"]),
                   F("value_income", f"${vi:,}", q["vi"]), F("value_sales", f"${vs:,}", q["vs"]), F("value_cost", f"${vc:,}", q["vc"]),
                   F("approaches", "Income capitalization and sales comparison; cost approach given little weight", q["app"])],
        "critical_dates": [],
    })


def appraisal_from_mark(name, A, firm, quarter, rep_long):
    mk = A["marks"][quarter]
    v, cap = mk["value"], mk["capRate"]
    appraisal_doc(name, A["name"], firm, long(quarter), rep_long, v, cap, round(v * cap / 100), v, round(v * 1.01 / 10000) * 10000, round(v * 0.9 / 10000) * 10000)


appraisal_from_mark("airport-flex-appraisal-2026q3", AF, "Fictional Valuation Advisors, MAI", "2026-09-30", "October 20, 2026")
appraisal_from_mark("route9-appraisal-2026q3", R9, "Example Appraisal Group, MAI", "2026-09-30", "October 22, 2026")

# ── Estoppel, CAM reconciliation and billing (phase H) ──────────────────────
e = {
    "who": "The undersigned, Desert Aero Parts LLC (Tenant), certifies to Model Fund I and its lender as of November 16, 2026 as follows.",
    "prem": "Tenant leases Building B, Suite 104 at Airport Flex Park containing 2,000 rentable square feet.",
    "lease": "The Lease is dated January 1, 2025 and has not been amended; there are no amendments.",
    "com": "The term commenced on March 1, 2025.", "exp": "The term expires on February 28, 2028.",
    "rent": "Current monthly base rent is $2,583.33.", "paid": "Rent has been paid through November 30, 2026.",
    "dep": "Tenant has deposited a security deposit of $2,500.00 with Landlord.",
    "ren": "Tenant has one (1) option to extend the term for three (3) years.",
    "tdef": "Tenant is not in default under the Lease. There are no tenant defaults.",
    "ldef": "Tenant claims a credit of $1,200 against rent for HVAC repairs Tenant paid in August 2026 that Landlord was required to make.",
    "pre": "No rent has been paid more than one month in advance; prepaid rent is $0.",
}
build("airport-flex-estoppel-desert-aero", "Tenant Estoppel Certificate – Desert Aero Parts LLC", [
    ("Certification", [e["who"], e["prem"], e["lease"], e["com"], e["exp"]]), ("Rent and deposit", [e["rent"], e["paid"], e["dep"], e["pre"]]),
    ("Options", [e["ren"]]), ("Defaults and claims", [e["tdef"], e["ldef"]])], {
    "doc_type": "estoppel", "title": "Desert Aero Parts estoppel", "summary": "Estoppel dated November 16, 2026: expiration stated as February 28, 2028 (the lease says February 29) and a $1,200 HVAC credit claimed against Landlord.",
    "fields": [F("tenant", "Desert Aero Parts LLC", e["who"]), F("estoppel_date", "November 16, 2026", e["who"]), F("premises", "Building B, Suite 104", e["prem"]),
               F("lease_date", "January 1, 2025", e["lease"]), F("amendments", "None", e["lease"]), F("commencement_date", "March 1, 2025", e["com"]),
               F("expiration_date", "February 28, 2028", e["exp"]), F("monthly_rent", "$2,583.33", e["rent"]), F("rent_paid_through", "November 30, 2026", e["paid"]),
               F("security_deposit", "$2,500.00", e["dep"]), F("renewal_options", "One (1) option of three (3) years", e["ren"]), F("tenant_defaults", "None", e["tdef"]),
               F("landlord_defaults", "Claims a $1,200 credit for HVAC repairs Landlord was required to make", e["ldef"]), F("prepaid_rent", "$0", e["pre"])],
    "critical_dates": [],
})

c = {
    "yr": "This statement reconciles Operating Expenses at Lakeshore Service Center for calendar year 2025.",
    "opex": "Total Operating Expenses for 2025 were $180,000.", "ctl": "Controllable Operating Expenses were $96,000.",
    "fee": "The management fee charged was $10,800 on gross revenues of $240,000.",
    "t1": "North Texas Fleet Service LLC: share 6.00%, share of expenses $10,800, estimates paid $10,200, balance due $600.",
    "t2": "Prairie Auto Glass Inc.: share 7.50%, share of expenses $13,500, estimates paid $13,500, balance due $0.",
}
build("lakeshore-cam-2025", "2025 Operating Expense Reconciliation – Lakeshore Service Center", [
    ("Summary", [c["yr"], c["opex"], c["ctl"], c["fee"]]), ("Tenant shares", [c["t1"], c["t2"]])], {
    "doc_type": "cam", "title": "Lakeshore 2025 CAM reconciliation", "summary": "2025 CAM reconciliation: $180,000 of expenses; North Texas Fleet billed at a 6.00% share (lease 5.50%) and a management fee of 4.5% of revenue (lease cap 4%).",
    "fields": [F("year", "2025", c["yr"]), F("total_opex", "$180,000", c["opex"]), F("controllable_opex", "$96,000", c["ctl"]),
               F("management_fee", "$10,800", c["fee"]), F("gross_revenue", "$240,000", c["fee"])],
    "tenants": [{"tenant": "North Texas Fleet Service LLC", "share_pct": 6.0, "billed": 10800, "base_year_amount": 0, "estimates_paid": 10200, "balance_due": 600, "evidence": [{"quote": c["t1"], "page": 1}]},
                {"tenant": "Prairie Auto Glass Inc.", "share_pct": 7.5, "billed": 13500, "base_year_amount": 0, "estimates_paid": 13500, "balance_due": 0, "evidence": [{"quote": c["t2"], "page": 1}]}],
    "critical_dates": [],
})

b = {
    "per": "Tenant invoices for November and December 2026 at Riverside Commerce Park.",
    "nov": "Citrus Belt Logistics, LLC, November 2026: base rent $4,713.33, CAM estimate $1,250.00, total $5,963.33.",
    "dec": "Citrus Belt Logistics, LLC, December 2026: base rent $4,713.33, CAM estimate $1,250.00, total $5,963.33.",
}
build("riverside-billing-2026-12", "Tenant Billing – Riverside Commerce Park", [("Period", [b["per"]]), ("Charges", [b["nov"], b["dec"]])], {
    "doc_type": "billing", "title": "Riverside billing Nov–Dec 2026", "summary": "November and December 2026 invoices for Citrus Belt Logistics; December still bills the Lease Year 3 rent.",
    "fields": [F("period", "November and December 2026", b["per"])],
    "charges": [{"tenant": "Citrus Belt Logistics, LLC", "month": "2026-11", "base_rent": 4713.33, "cam_estimate": 1250, "total": 5963.33, "evidence": [{"quote": b["nov"], "page": 1}]},
                {"tenant": "Citrus Belt Logistics, LLC", "month": "2026-12", "base_rent": 4713.33, "cam_estimate": 1250, "total": 5963.33, "evidence": [{"quote": b["dec"], "page": 1}]}],
    "critical_dates": [],
})
print("ok", len(list((OUT / "abstracts").glob("*.json"))))
