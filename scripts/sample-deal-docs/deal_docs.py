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
s = {
    "name": "The Property is Airport Flex Park, a multi-tenant flex industrial park.",
    "addr": "The address is 6230 Runway Vista Drive, Las Vegas, NV 89119.",
    "sf": "The buildings contain 24,000 rentable square feet in 12 units.",
    "yb": "The Property was built in 1998 and renovated in 2017.",
    "price": "The Seller is asking $7,500,000 for the Property.",
    "noi": "In-place net operating income is $486,000.",
    "cap": "The asking price reflects a 6.48% cap rate on in-place income.",
    "occ": "The Property is 91.7% leased to 11 tenants.",
}
build("airport-flex-om", "Airport Flex Park – Offering Memorandum", [
    ("Investment summary", [s["name"], s["addr"], s["sf"], s["yb"]]),
    ("Pricing", [s["price"], s["noi"], s["cap"]]),
    ("Occupancy", [s["occ"], "Tenants are local service, distribution and light industrial businesses."]),
], {
    "doc_type": "om", "title": "Airport Flex Park offering memo", "summary": "Offering memo for Airport Flex Park, a 24,000 SF, 12-unit flex park in Las Vegas, asking $7,500,000 (6.48% cap on $486,000 in-place NOI), 91.7% leased.",
    "fields": [F("property_name", "Airport Flex Park", s["name"]), F("address", "6230 Runway Vista Drive", s["addr"]), F("city", "Las Vegas", s["addr"]), F("state", "NV", s["addr"]),
               F("zip", "89119", s["addr"]), F("square_feet", "24,000", s["sf"]), F("units", "12", s["sf"]), F("year_built", "1998", s["yb"]),
               F("asking_price", "$7,500,000", s["price"]), F("in_place_noi", "$486,000", s["noi"]), F("cap_rate", "6.48%", s["cap"]), F("occupancy", "91.7%", s["occ"])],
    "critical_dates": [],
})

# ── Rent roll (4 units shown; one tenant change from the model) ─────────────
rr = [
    ("Unit 001: Ironwood Electrical Contractors, 2,000 SF, occupied, NNN, $17.93 per SF, lease from 2024-08-01 to 2026-07-30, 3% escalations, electrical contractor.",
     {"name": "001", "tenant": "Ironwood Electrical Contractors", "sf": 2000, "status": "occupied", "lease_type": "NNN", "rent_psf": 17.93, "lease_start": "2024-08-01", "lease_end": "2026-07-30", "escalation_pct": 3, "business": "Electrical contractor"}),
    ("Unit 002: Evergreen Food Distributors, 2,000 SF, occupied, NNN, $18.40 per SF, lease from 2025-02-01 to 2028-01-31, 3% escalations, food distribution.",
     {"name": "002", "tenant": "Evergreen Food Distributors", "sf": 2000, "status": "occupied", "lease_type": "NNN", "rent_psf": 18.40, "lease_start": "2025-02-01", "lease_end": "2028-01-31", "escalation_pct": 3, "business": "Food distribution"}),
    ("Unit 104: Desert Aero Parts LLC, 2,000 SF, occupied, MG, $15.50 per SF, lease from 2025-03-01 to 2028-02-29, $0.50 per SF annual increases, aircraft parts distribution.",
     {"name": "Building B Suite 104", "tenant": "Desert Aero Parts LLC", "sf": 2000, "status": "occupied", "lease_type": "MG", "rent_psf": 15.50, "lease_start": "2025-03-01", "lease_end": "2028-02-29", "escalation_pct": 3.33, "business": "Aircraft parts distribution"}),
    ("Unit 012: vacant, 2,000 SF.", {"name": "012", "tenant": "", "sf": 2000, "status": "vacant"}),
]
build("airport-flex-rent-roll", "Airport Flex Park – Rent Roll as of December 31, 2025", [
    ("Summary", ["Rent roll as of December 31, 2025.", "Units shown: 4 of 12 (excerpt for testing)."]),
    ("Units", [x[0] for x in rr]),
], {
    "doc_type": "rent_roll", "title": "Airport Flex Park rent roll (excerpt)", "summary": "Excerpt of the seller's rent roll: four units, including Desert Aero Parts in Building B Suite 104.",
    "fields": [F("as_of", "December 31, 2025", "Rent roll as of December 31, 2025.")],
    "units": [x[1] for x in rr], "critical_dates": [],
})

# ── T-12 ────────────────────────────────────────────────────────────────────
t = {
    "per": "Operating statement for the twelve months ended December 31, 2025.",
    "rent": "Base rent: $470,000.", "oth": "Other income: $6,000.", "rec": "Expense recoveries: $52,000.",
    "tax": "Real estate taxes: $30,000.", "ins": "Insurance: $9,600.", "util": "Utilities: $12,000.", "rm": "Repairs and maintenance: $10,800.",
    "jan": "Janitorial: $4,800.", "mgmt": "Management fee: $31,680.", "tot": "Total operating expenses: $98,880.", "noi": "Net operating income: $429,120.",
}
build("airport-flex-t12", "Airport Flex Park – Trailing Twelve Months", [
    ("Period", [t["per"]]), ("Income", [t["rent"], t["oth"], t["rec"]]),
    ("Expenses", [t["tax"], t["ins"], t["util"], t["rm"], t["jan"], t["mgmt"], t["tot"]]), ("Result", [t["noi"]]),
], {
    "doc_type": "t12", "title": "Airport Flex Park T-12 (2025)", "summary": "Seller's operating statement for 2025: $528,000 revenue, $98,880 expenses, $429,120 NOI.",
    "fields": [F("period_end", "December 31, 2025", t["per"]), F("gross_rent", "$470,000", t["rent"]), F("other_income", "$6,000", t["oth"]), F("recoveries", "$52,000", t["rec"]),
               F("real_estate_taxes", "$30,000", t["tax"]), F("insurance", "$9,600", t["ins"]), F("utilities", "$12,000", t["util"]), F("repairs_maintenance", "$10,800", t["rm"]),
               F("janitorial", "$4,800", t["jan"]), F("management_fee", "$31,680", t["mgmt"]), F("total_expenses", "$98,880", t["tot"]), F("noi", "$429,120", t["noi"])],
    "critical_dates": [],
})

# ── LOI ─────────────────────────────────────────────────────────────────────
l = {
    "date": "This letter of intent is dated October 20, 2025.",
    "parties": "The Buyer is Model Fund I – Airport Flex LLC and the Seller is Runway Vista Holdings LP.",
    "price": "The purchase price is $7,350,000.", "dep": "Buyer will deposit $150,000 in escrow within three business days of the PSA.",
    "dd": "Buyer will have a due diligence period of 45 days.", "close": "Closing will occur 30 days after the end of due diligence.",
    "fin": "There is no financing contingency.", "exp": "This letter expires if not countersigned by October 27, 2025.",
}
build("airport-flex-loi", "Letter of Intent – Airport Flex Park", [
    ("Terms", [l["date"], l["parties"], l["price"], l["dep"], l["dd"], l["close"], l["fin"]]), ("Expiration", [l["exp"]]),
], {
    "doc_type": "loi", "title": "Airport Flex Park LOI", "summary": "Non-binding LOI at $7,350,000 with a $150,000 deposit, 45 days of due diligence and closing 30 days later, no financing contingency.",
    "fields": [F("loi_date", "October 20, 2025", l["date"]), F("buyer", "Model Fund I – Airport Flex LLC", l["parties"]), F("seller", "Runway Vista Holdings LP", l["parties"]),
               F("purchase_price", "$7,350,000", l["price"]), F("deposit", "$150,000", l["dep"]), F("dd_days", "45 days", l["dd"]), F("closing_days", "30 days", l["close"]),
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
m = {
    "appr": "The Investment Committee approved the acquisition on December 18, 2025.",
    "who": "Approved by the Investment Committee: A. Sample, B. Example and C. Placeholder.",
    "price": "Approved purchase price: $7,200,000.", "cost": "Total cost including closing costs and capex: $7,788,000.",
    "loan": "Senior loan: $4,980,000.", "eq": "Equity: $2,900,000.", "noi": "Year-1 NOI: $462,000.",
    "gic": "Going-in cap rate: 6.42%.", "xc": "Exit cap rate: 6.75%.", "irr": "Projected IRR: 29.5%.", "em": "Projected equity multiple: 2.80x.",
    "coc": "Year-1 cash-on-cash: 4.0%.", "hold": "Hold period: 4 years.", "capex": "Capex budget: $300,000.",
    "c1": "Condition 1: Phase I environmental report with no recognized environmental conditions by January 15, 2026.",
    "c2": "Condition 2: Lender term sheet at 65% LTV or better by January 10, 2026.",
    "c3": "Condition 3: Tenant estoppels from at least 75% of leased square feet by January 20, 2026.",
    "c4": "Condition 4: Asset management plan presented to the Committee by April 30, 2026.",
}
build("airport-flex-ic-memo", "Final Investment Committee Memo – Airport Flex Park", [
    ("Approval", [m["appr"], m["who"]]), ("Approved terms", [m["price"], m["cost"], m["loan"], m["eq"], m["noi"], m["gic"], m["xc"], m["irr"], m["em"], m["coc"], m["hold"], m["capex"]]),
    ("Conditions of approval", [m["c1"], m["c2"], m["c3"], m["c4"]]),
], {
    "doc_type": "ic_memo", "title": "Airport Flex Park final IC memo", "summary": "IC approved Airport Flex Park on December 18, 2025 at $7,200,000 (29.5% IRR, 2.80x) subject to four conditions.",
    "fields": [F("approval_date", "December 18, 2025", m["appr"]), F("approvers", "A. Sample, B. Example and C. Placeholder", m["who"]), F("price", "$7,200,000", m["price"]),
               F("total_cost", "$7,788,000", m["cost"]), F("loan", "$4,980,000", m["loan"]), F("equity", "$2,900,000", m["eq"]), F("noi1", "$462,000", m["noi"]),
               F("going_in_cap", "6.42%", m["gic"]), F("exit_cap", "6.75%", m["xc"]), F("irr", "29.5%", m["irr"]), F("multiple", "2.80x", m["em"]), F("coc1", "4.0%", m["coc"]),
               F("hold_years", "4 years", m["hold"]), F("capex", "$300,000", m["capex"])],
    "conditions": [{"text": "Phase I environmental report with no recognized environmental conditions", "deadline": "2026-01-15"},
                   {"text": "Lender term sheet at 65% LTV or better", "deadline": "2026-01-10"},
                   {"text": "Tenant estoppels from at least 75% of leased square feet", "deadline": "2026-01-20"},
                   {"text": "Asset management plan presented to the Committee", "deadline": "2026-04-30"}],
    "critical_dates": [D("2025-12-18", "IC approval", m["appr"]), D("2026-04-30", "IC condition: asset management plan due", m["c4"], "Present the asset management plan to IC")],
})

# ── Closing statement (acquisition) ─────────────────────────────────────────
c = {
    "date": "Settlement date: January 30, 2026.", "price": "Contract sales price: $7,200,000.", "cred": "Seller credit for roof repairs: $45,000.",
    "pro": "Rent and tax prorations credited to Buyer: $12,350.", "dep": "Tenant security deposits transferred to Buyer: $26,400.",
    "cc": "Buyer's closing costs (title, escrow, legal, lender fees): $288,000.", "loan": "New loan proceeds: $4,980,000.", "eq": "Cash from Buyer at closing: $2,424,250.",
}
build("airport-flex-closing-acq", "Settlement Statement – Airport Flex Park (Acquisition)", [("Settlement", list(c.values()))], {
    "doc_type": "closing_acq", "title": "Airport Flex Park acquisition settlement statement", "summary": "Closed January 30, 2026 at $7,200,000; $288,000 buyer closing costs; $4,980,000 loan; $2,424,250 cash from buyer.",
    "fields": [F("closing_date", "January 30, 2026", c["date"]), F("contract_price", "$7,200,000", c["price"]), F("seller_credits", "$45,000", c["cred"]), F("prorations", "$12,350", c["pro"]),
               F("deposits_transferred", "$26,400", c["dep"]), F("closing_costs", "$288,000", c["cc"]), F("loan_proceeds", "$4,980,000", c["loan"]), F("equity_funded", "$2,424,250", c["eq"])],
    "critical_dates": [],
})

# ── Insurance certificates ──────────────────────────────────────────────────
o = {
    "ins": "Named insured: Model Fund I – Airport Flex LLC.", "hold": "Certificate holder: Fictional Bank, N.A., its successors and assigns, as mortgagee.",
    "co": "Insurer: Fictional Mutual Insurance Company, rated A (Excellent).", "date": "Certificate date: January 28, 2026.",
    "prop": "Property (all risk), policy PR-55120: limit $7,800,000, deductible $25,000, effective January 30, 2026, expires January 30, 2027.",
    "gl": "General liability, policy GL-55121: $1,000,000 each occurrence, $2,000,000 aggregate, effective January 15, 2026, expires January 15, 2027.",
    "umb": "Umbrella, policy UM-55122: limit $5,000,000, effective January 15, 2026, expires January 15, 2027.",
}
build("airport-flex-insurance-owner", "Certificate of Liability and Property Insurance (Owner)", [("Certificate", list(o.values()))], {
    "doc_type": "insurance_cert", "title": "Owner policies 2026", "summary": "Owner's property, general liability and umbrella policies for Airport Flex Park.",
    "fields": [F("insured", "Model Fund I – Airport Flex LLC", o["ins"]), F("holder", "Fictional Bank, N.A., as mortgagee", o["hold"]), F("insurer", "Fictional Mutual Insurance Company", o["co"]),
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

# ── Route 9 Small Bay: disposition (test sale) ──────────────────────────────
dsp = {
    "date": "Settlement date: October 30, 2026.", "price": "Contract sales price: $14,850,000.", "cred": "Credits to Buyer for prorations and deposits: $61,200.",
    "sc": "Seller's selling costs (commission, transfer tax, legal): $386,100.", "pay": "Payoff of existing loan including prepayment: $9,212,500.",
    "net": "Net proceeds to Seller: $5,190,200.",
}
build("route9-closing-disp", "Settlement Statement – Route 9 Small Bay (Sale)", [("Settlement", list(dsp.values()))], {
    "doc_type": "closing_disp", "title": "Route 9 Small Bay sale (test)", "summary": "Fictional test sale of Route 9 Small Bay on October 30, 2026 for $14,850,000.",
    "fields": [F("closing_date", "October 30, 2026", dsp["date"]), F("sale_price", "$14,850,000", dsp["price"]), F("credits", "$61,200", dsp["cred"]),
               F("selling_costs", "$386,100", dsp["sc"]), F("loan_payoff", "$9,212,500", dsp["pay"]), F("net_proceeds", "$5,190,200", dsp["net"])],
    "critical_dates": [],
})

# ── Model Fund I LPA and PPM ────────────────────────────────────────────────
lp = {
    "fund": "This Limited Partnership Agreement governs Model Fund I, L.P.",
    "cmt": "Aggregate Commitments: $100,000,000.", "gp": "The General Partner commits 5% of Aggregate Commitments.",
    "fee": "The Management Fee is 1.5% per year of Commitments during the Investment Period and of Invested Capital thereafter.",
    "pref": "Limited Partners receive a Preferred Return of 9% per year.", "cu": "The General Partner catch-up is 100% until it has received 20% of distributions.",
    "promote": "Above a 12% IRR distributions are split 80% to the Limited Partners and 20% to the General Partner; above 18%, 70% and 30%; thereafter 60% and 40%.",
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
    ("Article 1", [lp["fund"], lp["cmt"], lp["gp"]]), ("Article 4. Fees and distributions", [lp["fee"], lp["pref"], lp["cu"], lp["promote"]]),
    ("Article 5. Term", [lp["ip"], lp["term"], lp["ext"], lp["sub"]]), ("Article 6. Investment limitations", [lp[f"l{i}"] for i in range(1, 9)]),
], {
    "doc_type": "lpa", "title": "Model Fund I LPA (excerpt)", "summary": "Model Fund I: $100M commitments, 1.5% fee, 9% pref, 100% catch-up, 2-year investment period, 5-year term plus two 1-year extensions, and eight investment limits.",
    "fields": [F("fund_name", "Model Fund I, L.P.", lp["fund"]), F("commitments", "$100,000,000", lp["cmt"]), F("gp_commit_pct", "5%", lp["gp"]), F("mgmt_fee_pct", "1.5%", lp["fee"]),
               F("mgmt_fee_basis", "Commitments during the Investment Period, then Invested Capital", lp["fee"]), F("pref_pct", "9%", lp["pref"]), F("catch_up_pct", "100%", lp["cu"]),
               F("promote", "80/20 above 12% IRR; 70/30 above 18%; 60/40 thereafter", lp["promote"]), F("investment_period_years", "2 years", lp["ip"]),
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
def loan_doc(name, prop, amount, spread, ext_fee, date_long, date_iso, maturity_long, maturity_iso, notice_iso, notice_calc):
    q = {
        "parties": f"This Loan Agreement is made as of {date_long} between Fictional Bank, N.A. (Lender) and the Borrower, the owner of {prop}.",
        "amt": f"The Loan is in the principal amount of ${amount:,}.",
        "rate": f"Interest accrues at Term SOFR plus {spread:.2f}% per year, with Term SOFR not less than 0.50%.",
        "mat": f"The Initial Maturity Date is {maturity_long}, three years after closing.",
        "ext": f"Borrower may extend the Maturity Date by two successive extensions of 1 year each, each on payment of an extension fee of ${ext_fee:,}.",
        "extc": "Each extension requires written notice at least 60 days before the then Maturity Date, a debt service coverage ratio of at least 1.30x and a replacement rate cap.",
        "io": "Payments are interest only for 4 years, then principal is amortized on a 25-year schedule.",
        "cap": "Borrower shall maintain an interest rate cap with a strike not greater than 4.00% on Term SOFR, a notional amount not less than the outstanding principal, and a term of at least 1 year.",
        "capr": "The cap provider must be rated A or better by S&P, and Borrower shall deliver a replacement cap at least 30 days before the existing cap expires.",
        "dscr": "Borrower shall maintain a debt service coverage ratio of not less than 1.30x, tested quarterly on the trailing three months annualized.",
        "dy": "Borrower shall maintain a debt yield of not less than 8.50%.",
        "ltv": "The loan-to-value ratio shall not exceed 70%.",
        "cure": "Borrower may cure a covenant failure within 10 business days by a principal paydown or a cash collateral deposit.",
        "prep": "The Loan may be prepaid in whole after 12 months; before then a 1% exit fee applies.",
        "res": "Borrower shall fund monthly tax and insurance escrows and a $50,000 tenant improvement and leasing reserve at closing.",
        "rep": "Borrower shall deliver quarterly operating statements within 45 days after each quarter and annual statements within 120 days after each year.",
    }
    build(name, f"Loan Agreement – {prop} (excerpt)", [
        ("1. The loan", [q["parties"], q["amt"], q["rate"]]), ("2. Term", [q["mat"], q["ext"], q["extc"], q["io"]]), ("3. Rate cap", [q["cap"], q["capr"]]),
        ("4. Financial covenants", [q["dscr"], q["dy"], q["ltv"], q["cure"]]), ("5. Other", [q["prep"], q["res"], q["rep"]]),
    ], {
        "doc_type": "loan", "title": f"{prop} loan agreement", "summary": f"${amount:,} floating-rate loan from Fictional Bank at Term SOFR + {spread:.2f}% (0.50% floor), maturing {maturity_long} with two 1-year extensions; rate cap, DSCR 1.30x, debt yield 8.50% and 70% LTV covenants.",
        "fields": [F("lender", "Fictional Bank, N.A.", q["parties"], "1"), F("loan_date", date_long, q["parties"], "1"), F("loan_amount", f"${amount:,}", q["amt"], "1"),
                   F("index", "Term SOFR", q["rate"], "1"), F("spread_pct", f"{spread:.2f}%", q["rate"], "1"), F("floor_pct", "0.50%", q["rate"], "1"),
                   F("maturity_date", maturity_long, q["mat"], "2"), F("initial_term_years", "3 years", q["mat"], "2"), F("extension_count", "2", q["ext"], "2"),
                   F("extension_term_years", "1 year", q["ext"], "2"), F("extension_fee", f"${ext_fee:,}", q["ext"], "2"),
                   F("extension_conditions", "Notice at least 60 days before maturity, DSCR of at least 1.30x and a replacement rate cap", q["extc"], "2"),
                   F("io_years", "4 years", q["io"], "2"), F("amortization_years", "25 years", q["io"], "2"),
                   F("cap_strike_pct", "4.00%", q["cap"], "3"), F("cap_term", "At least 1 year", q["cap"], "3"), F("cap_min_rating", "A", q["capr"], "3"),
                   F("cap_replacement_days", "30 days", q["capr"], "3"), F("dscr_covenant", "1.30x", q["dscr"], "4"), F("debt_yield_covenant", "8.50%", q["dy"], "4"),
                   F("ltv_covenant", "70%", q["ltv"], "4"), F("covenant_testing", "Quarterly on the trailing three months annualized", q["dscr"], "4"),
                   F("cure", "Within 10 business days by a principal paydown or a cash collateral deposit", q["cure"], "4"),
                   F("prepayment", "In whole after 12 months; 1% exit fee before then", q["prep"], "5"),
                   F("reserves", "Monthly tax and insurance escrows; $50,000 TI and leasing reserve at closing", q["res"], "5"),
                   F("reporting", "Quarterly within 45 days; annual within 120 days", q["rep"], "5")],
        "critical_dates": [D(maturity_iso, "Initial maturity", q["mat"], "Repay or extend", "2"),
                           {"date": notice_iso, "kind": "deadline", "label": "First extension notice deadline", "action": "Give written notice to extend", "clause": "2", "status": "calculated", "calculation": notice_calc, "evidence": [{"quote": q["extc"], "page": 1}]}],
    })


loan_doc("airport-flex-loan", "Airport Flex Park", 4980000, 2.00, 62000, "January 30, 2026", "2026-01-30", "January 30, 2029", "2029-01-30", "2028-12-01", "January 30, 2029 − 60 days = December 1, 2028")
loan_doc("route9-loan", "Route 9 Small Bay", 9125000, 1.75, 114000, "March 16, 2026", "2026-03-16", "March 16, 2029", "2029-03-16", "2029-01-15", "March 16, 2029 − 60 days = January 15, 2029")


def cap_doc(name, prop, cp, rating, trade_long, eff_long, term_long, notional, strike, premium, ref):
    q = {
        "cp": f"This Confirmation sets out the terms of the interest rate cap entered into between {cp} (Party A) and the owner of {prop} (Party B), reference {ref}.",
        "rt": f"Party A is rated {rating} by S&P.",
        "trade": f"Trade Date: {trade_long}.", "eff": f"Effective Date: {eff_long}.", "term": f"Termination Date: {term_long}.",
        "notional": f"Notional Amount: ${notional:,}.", "index": "Floating Rate Option: USD Term SOFR, 1 month.",
        "strike": f"Cap Rate: {strike:.2f}%.", "prem": f"Fixed Amount (premium): ${premium:,}, payable by Party B on the Effective Date.",
        "dc": "Floating Rate Day Count Fraction: Actual/360.", "agent": f"Calculation Agent: {cp}.",
        "assign": "Party B has collaterally assigned its rights under this Transaction to Fictional Bank, N.A., as Lender.",
    }
    build(name, f"Interest Rate Cap Confirmation – {prop}", [("General terms", [q["cp"], q["rt"], q["trade"], q["eff"], q["term"], q["notional"]]),
                                                            ("Floating amounts", [q["index"], q["strike"], q["dc"]]), ("Premium and other", [q["prem"], q["agent"], q["assign"]])], {
        "doc_type": "rate_cap", "title": f"{prop} cap {eff_long[-4:]}", "summary": f"Executed {strike:.2f}% Term SOFR cap from {cp} ({rating}) on ${notional:,}, {eff_long} to {term_long}, premium ${premium:,}.",
        "fields": [F("counterparty", cp, q["cp"]), F("counterparty_rating", rating, q["rt"]), F("trade_date", trade_long, q["trade"]), F("effective_date", eff_long, q["eff"]),
                   F("termination_date", term_long, q["term"]), F("notional", f"${notional:,}", q["notional"]), F("index", "1-month Term SOFR", q["index"]),
                   F("strike_pct", f"{strike:.2f}%", q["strike"]), F("premium", f"${premium:,}", q["prem"]), {**F("payment_date", eff_long, q["prem"]), "evidence": [{"quote": q["prem"], "page": 1}, {"quote": q["eff"], "page": 1}]},
                   F("day_count", "Actual/360", q["dc"]), F("calculation_agent", cp, q["agent"]), F("assigned_to", "Fictional Bank, N.A.", q["assign"])],
        "critical_dates": [],
    })


cap_doc("airport-flex-cap-2026", "Airport Flex Park", "Fictional Capital Markets LLC", "A+", "January 26, 2026", "January 30, 2026", "January 30, 2027", 4980000, 3.91, 27858, "FCM-26-0131")
cap_doc("route9-cap-2026", "Route 9 Small Bay", "Example Derivatives Corp", "BBB+", "March 12, 2026", "March 16, 2026", "March 16, 2027", 9000000, 3.91, 51045, "EDC-26-0316")
print("phase F docs ok")
print("ok", len(list((OUT / "abstracts").glob("*.json"))))
