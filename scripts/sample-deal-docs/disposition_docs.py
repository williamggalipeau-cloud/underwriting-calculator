"""Fictional disposition documents for version 1.1 (user, 11/25): a BOV, an
LOI, a PSA and a closing statement for three Model Fund I assets, to test
Claude reading them (Dispositions → a sale → Review with Claude → Apply).

Writes docs/sample-deal-docs/dispositions/html/<name>.html and
docs/sample-deal-docs/dispositions/abstracts/<name>.json; print the PDFs with
  node scripts/sample-deal-docs/print_html.cjs docs/sample-deal-docs/dispositions
Every value's quote is a sentence of the document, so the abstracts pass the
app's local check against the PDF text. All names, parties and figures are
made up.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "docs" / "sample-deal-docs" / "dispositions"
(OUT / "html").mkdir(parents=True, exist_ok=True)
(OUT / "abstracts").mkdir(parents=True, exist_ok=True)

CSS = ("body{font:11.5px/1.5 Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 4px}"
       "p{margin:4px 0}.banner{color:#b42318;font-weight:bold;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:12px}")
BANNER = '<div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>'


def build(name, title, sections, abstract):
    body = "".join(f"<h2>{h}</h2>" + "".join(f"<p>{s}</p>" for s in ps) for h, ps in sections)
    html = f'<html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{BANNER}<h1>{title}</h1>{body}<p style="color:#555">This document is fictional and was created for software testing.</p></body></html>'
    (OUT / "html" / f"{name}.html").write_text(html)
    text = " ".join(s for _, ps in sections for s in ps)
    for f in abstract.get("fields", []):
        for e in f.get("evidence", []):
            assert e["quote"] in text, (name, f["key"], e["quote"])
    abstract.setdefault("app", {}).update({"validated": False, "made_with": "Sample (fictional)", "files": [f"{name}.pdf"]})
    (OUT / "abstracts" / f"{name}.json").write_text(json.dumps(abstract, indent=1, ensure_ascii=False))


def F(key, value, quote, clause=None):
    f = {"key": key, "value": value, "status": "found", "evidence": [{"quote": quote, "page": 1}]}
    if clause:
        f["clause"] = clause
    return f


def D(date, label, quote, action=""):
    return {"date": date, "kind": "deadline", "label": label, "action": action, "status": "found", "evidence": [{"quote": quote, "page": 1}]}


def m(x):
    return f"${x:,.0f}"


# 1.1.13 (everything ties out): the three sales are IN PROGRESS, because Model
# Fund I holds no sold asset. Every figure comes from the fund as the app
# builds it (fund.json, written by export_fund.cjs): the broker's value is
# the asset's latest mark where it has one, else its year-1 NOI at a cap
# rate 25 basis points inside the model's going-in cap; the list price, offer and contract price follow from it.
# Only what the app does not hold is written here (broker, buyer, dates,
# deposit terms). The sale's entries in the app (lib/sampleDocTerms.json) are
# produced by reading these abstracts with the app's own apply functions
# (make_terms.cjs). The earlier set, with closing statements, is kept for
# the tests in tests/fixtures/dispositions.
FUND = json.loads((Path(__file__).resolve().parent / "fund.json").read_text())
_A = {a["name"]: a for a in FUND["assets"]}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def long(iso):
    y, mo, d = (int(x) for x in iso.split("-"))
    return f"{MONTHS[mo - 1]} {d}, {y}"


def r50(x):
    return int(round(x / 50_000) * 50_000)


def sale(name, slug, company, broker, buyer, fee, weeks, loi_date, dd, cl, fin, psa=None):
    A = _A[name]
    marks = A.get("marks") or {}
    if marks:
        q = sorted(marks)[-1]
        mid, cap = int(marks[q]["value"]), float(marks[q]["capRate"])
    else:
        # No mark yet: year-1 NOI at a cap rate 25 basis points inside the going-in cap.
        mid = r50(A["model"]["noi1"] / ((A["model"]["goingInCapPct"] - 0.25) / 100))
        cap = round(A["model"]["noi1"] / mid * 100, 2)
    offer = r50(mid * 0.99)
    d = dict(name=name, slug=slug, addr=f"{A['address']}, {A['city']}, {A['state']} {A['zip']}", sf=A["sf"], broker=broker, buyer=buyer,
             seller=f"Model Fund I — {company} LLC", low=r50(mid * 0.97), mid=mid, high=r50(mid * 1.03), cap=f"{cap:.2f}%", list_=r50(mid * 1.03),
             fee=fee, weeks=weeks, loi_date=(long(loi_date), loi_date), loi=offer, dep=r50(offer * 0.02) or 50_000, dd=dd, cl=cl, fin=fin, psa=None)
    if psa:
        d["psa"] = dict(date=(long(psa["date"]), psa["date"]), price=offer, add_dep=d["dep"], hard=(long(psa["dd_end"]), psa["dd_end"]),
                        dd_end=(long(psa["dd_end"]), psa["dd_end"]), close=(long(psa["close"]), psa["close"]))
    return d


ASSETS = [
    # Under contract.
    sale("Route 9 Small Bay", "route9", "Valley Freight", "Fictional Industrial Advisors", "Example Logistics REIT", "1.25%", "eight weeks",
         "2026-11-06", 30, 30, False, psa=dict(date="2026-11-20", dd_end="2026-12-21", close="2027-01-20")),
    # Offers in hand.
    sale("Harbor Light Industrial", "harbor-light", "Pier Junction", "Sample Coastal Brokerage", "Fictional Pacific Industrial Fund II", "1.00%", "ten weeks",
         "2026-11-12", 45, 30, True),
    sale("Mill Creek Business Park", "mill-creek", "Mill Creek", "Example Northwest Capital Markets", "Demo Flex Owners LLC", "1.10%", "eight weeks",
         "2026-11-18", 30, 45, False),
]

for a in ASSETS:
    n, slug = a["name"], a["slug"]

    # ── BOV ──
    q = {
        "broker": f"Prepared by {a['broker']} for {a['seller']}.",
        "date": "This opinion of value is dated November 2, 2026.",
        "range": f"We estimate the market value of {n} at between {m(a['low'])} and {m(a['high'])}.",
        "mid": f"Our most likely value is {m(a['mid'])}.",
        "psf": f"That value is ${a['mid'] / a['sf']:,.0f} per square foot.",
        "cap": f"The most likely value reflects a {a['cap']} cap rate on in-place net operating income.",
        "list": f"We recommend a list price of {m(a['list_'])}.",
        "fee": f"Our proposed listing fee is {a['fee']} of the sale price.",
        "time": f"We expect a marketing period of {a['weeks']} from launch to a call for offers.",
    }
    build(f"{slug}-bov", f"{n} – Broker Opinion of Value", [
        ("Engagement", [q["broker"], q["date"], f"The Property is {n} at {a['addr']}, with {a['sf']:,} rentable square feet."]),
        ("Value", [q["range"], q["mid"], q["psf"], q["cap"]]),
        ("Pricing and marketing", [q["list"], q["fee"], q["time"]]),
    ], {"doc_type": "bov", "title": f"{n} BOV", "summary": f"{a['broker']} values {n} at {m(a['low'])}–{m(a['high'])}, most likely {m(a['mid'])}, and recommends listing at {m(a['list_'])}.",
        "fields": [F("broker", a["broker"], q["broker"]), F("bov_date", "November 2, 2026", q["date"]), F("value_low", m(a["low"]), q["range"]),
                   F("value_mid", m(a["mid"]), q["mid"]), F("value_high", m(a["high"]), q["range"]), F("price_psf", f"{a['mid'] / a['sf']:,.0f}", q["psf"]),
                   F("cap_rate", a["cap"], q["cap"]), F("list_price", m(a["list_"]), q["list"]), F("listing_fee_pct", a["fee"], q["fee"]),
                   F("marketing_timeline", a["weeks"], q["time"])],
        "critical_dates": []})

    # ── LOI (offer letter) ──
    fin = ("Buyer's obligations are not contingent on financing." if not a["fin"]
           else "Buyer's obligations are contingent on Buyer obtaining acquisition financing.")
    q = {
        "date": f"This letter of intent is dated {a['loi_date'][0]}.",
        "buyer": f"The Buyer is {a['buyer']}.",
        "seller": f"The Seller is {a['seller']}.",
        "price": f"The Purchase Price is {m(a['loi'])}.",
        "dep": f"Buyer will deliver an initial deposit of {m(a['dep'])} within three business days of a signed purchase agreement.",
        "dd": f"Buyer shall have a due diligence period of {a['dd']} days.",
        "cl": f"Closing will occur {a['cl']} days after the end of the due diligence period.",
        "fin": fin,
    }
    build(f"{slug}-loi", f"{n} – Letter of Intent to Purchase", [
        ("Parties", [q["date"], q["buyer"], q["seller"], f"The Property is {n} at {a['addr']}."]),
        ("Price and deposit", [q["price"], q["dep"]]),
        ("Timing and conditions", [q["dd"], q["cl"], q["fin"], "This letter is not binding except for confidentiality."]),
    ], {"doc_type": "offer_letter", "title": f"{n} LOI from {a['buyer']}", "summary": f"{a['buyer']} offers {m(a['loi'])} for {n} with a {m(a['dep'])} deposit and {a['dd']}-day due diligence.",
        "fields": [F("loi_date", a["loi_date"][0], q["date"]), F("buyer", a["buyer"], q["buyer"]), F("seller", a["seller"], q["seller"]),
                   F("purchase_price", m(a["loi"]), q["price"]), F("deposit", m(a["dep"]), q["dep"]), F("dd_days", f"{a['dd']} days", q["dd"]),
                   F("closing_days", f"{a['cl']} days", q["cl"]), F("financing_contingency", fin, q["fin"])],
        "critical_dates": []})

    # ── PSA (only the sale under contract) ──
    if not a["psa"]:
        continue
    P = a["psa"]
    q = {
        "date": f"This Purchase and Sale Agreement is effective {P['date'][0]}.",
        "price": f"The Purchase Price for the Property is {m(P['price'])}.",
        "dep1": f"Buyer shall deposit {m(a['dep'])} with Escrow Agent as the Initial Deposit.",
        "dep2": f"Buyer shall deposit an additional {m(P['add_dep'])} as the Additional Deposit at the end of the Due Diligence Period.",
        "hard": f"The Deposits become non-refundable on {P['hard'][0]}.",
        "dd": f"The Due Diligence Period expires on {P['dd_end'][0]}.",
        "close": f"Closing shall occur on {P['close'][0]}.",
        "ext": "Seller may extend Closing once by up to 15 days.",
    }
    build(f"{slug}-psa", f"{n} – Purchase and Sale Agreement", [
        ("1. Parties and property", [q["date"], f"The Seller is {a['seller']} and the Buyer is {a['buyer']}.", f"The Property is {n} at {a['addr']}."]),
        ("2. Price and deposits", [q["price"], q["dep1"], q["dep2"], q["hard"]]),
        ("3. Due diligence and closing", [q["dd"], q["close"], q["ext"]]),
    ], {"doc_type": "psa", "title": f"{n} PSA", "summary": f"PSA with {a['buyer']} at {m(P['price'])}; deposits {m(a['dep'] + P['add_dep'])}; closing {P['close'][0]}.",
        "fields": [F("psa_date", P["date"][0], q["date"], "1"), F("purchase_price", m(P["price"]), q["price"], "2"),
                   F("initial_deposit", m(a["dep"]), q["dep1"], "2"), F("additional_deposit", m(P["add_dep"]), q["dep2"], "2"),
                   F("deposit_hard_date", P["hard"][0], q["hard"], "2"), F("dd_expiry", P["dd_end"][0], q["dd"], "3"),
                   F("closing_date", P["close"][0], q["close"], "3"), F("extension", "Seller may extend Closing once by up to 15 days", q["ext"], "3")],
        "critical_dates": [D(P["hard"][1], "Deposits go hard", q["hard"], "Deposits become non-refundable"),
                           D(P["dd_end"][1], "Due diligence expires", q["dd"], "Buyer's termination right ends"),
                           D(P["close"][1], "Closing", q["close"], "Close the sale")]})


print("sale documents written to", OUT)
