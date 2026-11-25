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


# name, slug, address, SF, broker, buyer, seller entity, list, low, mid, high, cap, LOI price,
# deposit, DD days, close days, PSA date, add'l deposit, hard date, DD end, close date,
# sale price, credits, selling costs, loan payoff
ASSETS = [
    dict(name="Route 9 Small Bay", slug="route9", addr="21800 Valley Freight Way, Kent, WA 98032", sf=42000,
         broker="Fictional Industrial Advisors", buyer="Example Logistics REIT", seller="Model Fund I Route 9 LLC",
         low=14_100_000, mid=14_600_000, high=15_100_000, cap="5.85%", list_=14_950_000, fee="1.25%", weeks="eight weeks",
         loi_date=("November 6, 2026", "2026-11-06"), loi=14_400_000, dep=300_000, dd=30, cl=30, fin=False,
         psa_date=("December 1, 2026", "2026-12-01"), psa_price=14_500_000, add_dep=200_000,
         hard=("December 31, 2026", "2026-12-31"), dd_end=("December 31, 2026", "2026-12-31"), close=("January 29, 2027", "2027-01-29"),
         sale=14_500_000, credits=45_000, costs=315_000, payoff=9_400_000),
    dict(name="Harbor Light Industrial", slug="harbor-light", addr="2715 Pier Junction Avenue, Long Beach, CA 90810", sf=36000,
         broker="Sample Coastal Brokerage", buyer="Fictional Pacific Industrial Fund II", seller="Model Fund I Harbor Light LLC",
         low=11_300_000, mid=11_700_000, high=12_100_000, cap="5.60%", list_=11_950_000, fee="1.00%", weeks="ten weeks",
         loi_date=("November 12, 2026", "2026-11-12"), loi=11_500_000, dep=250_000, dd=45, cl=30, fin=True,
         psa_date=("December 8, 2026", "2026-12-08"), psa_price=11_600_000, add_dep=150_000,
         hard=("January 22, 2027", "2027-01-22"), dd_end=("January 22, 2027", "2027-01-22"), close=("February 22, 2027", "2027-02-22"),
         sale=11_550_000, credits=60_000, costs=255_000, payoff=7_300_000),
    dict(name="Mill Creek Business Park", slug="mill-creek", addr="11500 Mill Creek Loop, Everett, WA 98204", sf=50000,
         broker="Example Northwest Capital Markets", buyer="Demo Flex Owners LLC", seller="Model Fund I Mill Creek LLC",
         low=17_200_000, mid=17_800_000, high=18_300_000, cap="5.75%", list_=18_200_000, fee="1.10%", weeks="eight weeks",
         loi_date=("November 18, 2026", "2026-11-18"), loi=17_600_000, dep=400_000, dd=30, cl=45, fin=False,
         psa_date=("December 14, 2026", "2026-12-14"), psa_price=17_650_000, add_dep=250_000,
         hard=("January 13, 2027", "2027-01-13"), dd_end=("January 13, 2027", "2027-01-13"), close=("February 27, 2027", "2027-02-27"),
         sale=17_650_000, credits=70_000, costs=380_000, payoff=11_100_000),
]

for a in ASSETS:
    n, slug = a["name"], a["slug"]

    # ── BOV ──
    q = {
        "broker": f"Prepared by {a['broker']} for {a['seller']}.",
        "date": f"This opinion of value is dated {a['loi_date'][0].split(' ')[0]} 2, 2026.",
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

    # ── PSA ──
    q = {
        "date": f"This Purchase and Sale Agreement is effective {a['psa_date'][0]}.",
        "price": f"The Purchase Price for the Property is {m(a['psa_price'])}.",
        "dep1": f"Buyer shall deposit {m(a['dep'])} with Escrow Agent as the Initial Deposit.",
        "dep2": f"Buyer shall deposit an additional {m(a['add_dep'])} as the Additional Deposit at the end of the Due Diligence Period.",
        "hard": f"The Deposits become non-refundable on {a['hard'][0]}.",
        "dd": f"The Due Diligence Period expires on {a['dd_end'][0]}.",
        "close": f"Closing shall occur on {a['close'][0]}.",
        "ext": "Seller may extend Closing once by up to 15 days.",
    }
    build(f"{slug}-psa", f"{n} – Purchase and Sale Agreement", [
        ("1. Parties and property", [q["date"], f"The Seller is {a['seller']} and the Buyer is {a['buyer']}.", f"The Property is {n} at {a['addr']}."]),
        ("2. Price and deposits", [q["price"], q["dep1"], q["dep2"], q["hard"]]),
        ("3. Due diligence and closing", [q["dd"], q["close"], q["ext"]]),
    ], {"doc_type": "psa", "title": f"{n} PSA", "summary": f"PSA with {a['buyer']} at {m(a['psa_price'])}; deposits {m(a['dep'] + a['add_dep'])}; closing {a['close'][0]}.",
        "fields": [F("psa_date", a["psa_date"][0], q["date"], "1"), F("purchase_price", m(a["psa_price"]), q["price"], "2"),
                   F("initial_deposit", m(a["dep"]), q["dep1"], "2"), F("additional_deposit", m(a["add_dep"]), q["dep2"], "2"),
                   F("deposit_hard_date", a["hard"][0], q["hard"], "2"), F("dd_expiry", a["dd_end"][0], q["dd"], "3"),
                   F("closing_date", a["close"][0], q["close"], "3"), F("extension", "Seller may extend Closing once by up to 15 days", q["ext"], "3")],
        "critical_dates": [D(a["hard"][1], "Deposits go hard", q["hard"], "Deposits become non-refundable"),
                           D(a["dd_end"][1], "Due diligence expires", q["dd"], "Buyer's termination right ends"),
                           D(a["close"][1], "Closing", q["close"], "Close the sale")]})

    # ── Closing statement (sale) ──
    net = a["sale"] - a["credits"] - a["costs"] - a["payoff"]
    q = {
        "date": f"Closing date: {a['close'][0]}.",
        "price": f"Sale price: {m(a['sale'])}.",
        "credits": f"Credits to Buyer (rent prorations and repairs): {m(a['credits'])}.",
        "costs": f"Seller's closing costs, including brokerage commission, title and transfer tax: {m(a['costs'])}.",
        "payoff": f"Payoff of the existing loan, including interest to the closing date: {m(a['payoff'])}.",
        "net": f"Net proceeds due to Seller: {m(net)}.",
    }
    build(f"{slug}-closing-disp", f"{n} – Seller's Closing Statement", [
        ("Transaction", [f"Seller: {a['seller']}. Buyer: {a['buyer']}.", f"Property: {n}, {a['addr']}.", q["date"]]),
        ("Seller's statement", [q["price"], q["credits"], q["costs"], q["payoff"], q["net"]]),
    ], {"doc_type": "closing_disp", "title": f"{n} closing statement", "summary": f"{n} sold to {a['buyer']} for {m(a['sale'])}; net proceeds {m(net)}.",
        "fields": [F("closing_date", a["close"][0], q["date"]), F("sale_price", m(a["sale"]), q["price"]), F("credits", m(a["credits"]), q["credits"]),
                   F("selling_costs", m(a["costs"]), q["costs"]), F("loan_payoff", m(a["payoff"]), q["payoff"]), F("net_proceeds", m(net), q["net"])],
        "critical_dates": []})

print(f"{len(ASSETS) * 4} documents written to {OUT}")
