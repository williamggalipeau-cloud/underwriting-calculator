"""Builds the fictional sample leases (HTML) in docs/sample-leases/html/.

    python3 scripts/sample-leases/generate.py
    node scripts/sample-leases/pdf.cjs        # HTML -> PDF

Everything in these documents is invented, for testing lease abstraction.
They are not legal forms and must not be used as real leases.
"""

import html
import json
import os
import sys
from datetime import date

from dateutil.relativedelta import relativedelta

sys.path.insert(0, os.path.dirname(__file__))
from leases import ASSETS, BASE, LEASES, STATE_NAMES  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "sample-leases", "html")
WATERMARK = "SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL LEASE"

NUM_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
             10: "ten", 12: "twelve", 15: "fifteen", 20: "twenty", 30: "thirty", 36: "thirty-six", 39: "thirty-nine",
             60: "sixty", 72: "seventy-two", 84: "eighty-four", 90: "ninety", 120: "one hundred twenty", 180: "one hundred eighty"}


def d(iso):
    return date.fromisoformat(iso)


def long_date(x):
    x = d(x) if isinstance(x, str) else x
    return x.strftime("%B %-d, %Y")


def money(v):
    return f"${v:,.2f}"


def words(n):
    return f"{NUM_WORDS.get(n, str(n))} ({n})"


def e(s):
    return html.escape(str(s))


def rent_schedule(L):
    """Lease-year rent periods: (start, end, rate $/SF/yr, monthly, note)."""
    start = d(L["commencement"])
    end = start + relativedelta(months=L["term_months"]) - relativedelta(days=1)
    rows = []
    y = 0
    cur = start
    while cur <= end:
        nxt = min(cur + relativedelta(years=1) - relativedelta(days=1), end)
        if L.get("step"):
            rate = round(L["rate"] + L["step"] * y, 2)
        else:
            rate = round(L["rate"] * (1 + L.get("escalation", 0) / 100) ** y, 2)
        monthly = round(L["rsf"] * rate / 12, 2)
        rows.append([cur, nxt, rate, monthly, ""])
        cur = nxt + relativedelta(days=1)
        y += 1
    fr = L.get("free_rent_months", 0)
    if fr:
        free_end = start + relativedelta(months=fr) - relativedelta(days=1)
        first = rows[0]
        rows[0] = [first[0], free_end, first[2], 0.0, f"Base Rent abated ({fr} months); Operating Expenses payable"]
        rows.insert(1, [free_end + relativedelta(days=1), first[1], first[2], first[3], ""])
    return start, end, rows


def tenant_share(L):
    return L["rsf"] / L["building_rsf"] * 100


def basic_info(L, A, start, end, rows):
    st = STATE_NAMES[A["state"]]
    first_paying = next(r for r in rows if r[3] > 0)
    deposit = L["deposit_amount"] if L.get("deposit_amount") is not None else round(first_paying[3] * L["deposit_months"], 2)
    type_label = {"NNN": "Triple net (NNN)", "MG": f"Modified gross, Base Year {L.get('base_year')}", "Gross": "Gross (Landlord pays Operating Expenses)"}[L["lease_type"]]
    items = [
        ("Landlord", f"{L['landlord']}, a Delaware limited liability company"),
        ("Tenant", L["tenant"]),
        ("Guarantor", L["guarantor"] or "None"),
        ("Project", f"{L['asset']}, {A['address']}, {A['city']}, {st} {A['zip']} (fictional address)"),
        ("Premises", f"{L['suite']}, containing approximately {L['rsf']:,} rentable square feet"),
        ("Building area", f"{L['building_rsf']:,} rentable square feet"),
        ("Tenant's Share", f"{tenant_share(L):.2f}%"),
        ("Permitted Use", L["permitted_use"]),
        ("Term", f"{words(L['term_months'])} months"),
        ("Commencement Date", long_date(start)),
        ("Expiration Date", long_date(end)),
        ("Base Rent", f"{money(rows[0][2])} per rentable square foot per year, as scheduled in Section 4"),
        ("Lease type", type_label),
        ("Security Deposit", money(deposit)),
        ("Broker(s)", "Fictional Realty Advisors (Landlord) and none (Tenant)"),
    ]
    trs = "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in items)
    return f"<h2>1. Basic Lease Information</h2><table class='info'>{trs}</table>", deposit


def schedule_table(rows):
    trs = "".join(
        f"<tr><td>{long_date(a)}</td><td>{long_date(b)}</td><td class='n'>{money(r)}</td><td class='n'>{money(m)}</td><td>{e(note)}</td></tr>"
        for a, b, r, m, note in rows
    )
    return ("<table class='grid'><thead><tr><th>From</th><th>Through</th><th>Annual rate per RSF</th><th>Monthly Base Rent</th><th>Note</th></tr></thead>"
            f"<tbody>{trs}</tbody></table>")


STATE_TEXT = {
    "CA": [
        ("Certified Access Specialist disclosure", "As required by California Civil Code Section 1938, Landlord states that the Premises have not undergone an inspection by a Certified Access Specialist (CASp). A CASp can inspect the Premises and determine whether they comply with all applicable construction-related accessibility standards under state law. Although state law does not require a CASp inspection, Landlord may not prohibit Tenant from obtaining one for Tenant's occupancy, if requested by Tenant. The parties shall agree on the time and manner of any inspection, who pays for it, and who pays to correct any violations it identifies; absent agreement, Tenant shall bear both costs."),
        ("Security Deposit", "The Security Deposit is held under California Civil Code Section 1950.7. Landlord may apply only so much of it as is reasonably necessary to cure Tenant's defaults in rent, to repair damage caused by Tenant, or to clean the Premises, and shall return the remainder within thirty (30) days after Landlord regains possession of the Premises."),
        ("Proposition 65", "Tenant shall comply with the Safe Drinking Water and Toxic Enforcement Act of 1986 (California Health and Safety Code Section 25249.5 et seq.) for its operations, including any warnings it is required to give."),
        ("Waivers", "Tenant waives the provisions of California Civil Code Sections 1932(2), 1933(4), 1941 and 1942, and any similar law, to the extent they would permit Tenant to terminate this Lease or make repairs at Landlord's expense."),
    ],
    "NV": [
        ("Governing statute", "This Lease is a commercial lease governed by Chapter 118C of the Nevada Revised Statutes. Landlord shall change the locks to the Premises or exclude Tenant only as permitted by that Chapter."),
        ("Security Deposit", "Landlord may commingle the Security Deposit with its other funds and shall return any unapplied balance to Tenant within thirty (30) days after the expiration of the Term and Tenant's surrender of the Premises."),
        ("Summary eviction", "Tenant acknowledges that Landlord may pursue any remedy available to a commercial landlord under Nevada law, including summary eviction proceedings, following an Event of Default."),
    ],
    "WA": [
        ("Governing statute", "This Lease is a commercial lease. The Residential Landlord-Tenant Act (RCW Chapter 59.18) does not apply. Landlord's remedies for unlawful detainer are governed by RCW Chapter 59.12, and any notice to pay rent or vacate shall be given as that Chapter requires."),
        ("Security Deposit", "Landlord may commingle the Security Deposit with its other funds and shall return any unapplied balance to Tenant within thirty (30) days after the expiration of the Term and Tenant's surrender of the Premises."),
        ("Real estate excise and leasehold taxes", "Tenant shall pay any tax imposed on its leasehold interest, its personal property or its business operations at the Premises."),
    ],
    "TX": [
        ("Security Deposit", "Landlord shall refund the Security Deposit, less lawful deductions itemized in writing, within sixty (60) days after Tenant surrenders the Premises, as required by Section 93.005 of the Texas Property Code."),
        ("Lockout", "If Tenant is delinquent in paying rent, Landlord may change the door locks of the Premises only in accordance with Section 93.002 of the Texas Property Code, including posting written notice of where the new key may be obtained."),
        ("Landlord's lien", "<b><u>TENANT GRANTS LANDLORD A CONTRACTUAL LIEN ON ALL OF TENANT'S PERSONAL PROPERTY AT THE PREMISES TO SECURE THE PAYMENT OF RENT, IN ADDITION TO LANDLORD'S STATUTORY LIEN UNDER SECTION 54.021 OF THE TEXAS PROPERTY CODE.</u></b>"),
        ("Deceptive Trade Practices Act waiver", "<b>TENANT WAIVES ITS RIGHTS UNDER THE DECEPTIVE TRADE PRACTICES–CONSUMER PROTECTION ACT, SECTION 17.41 ET SEQ., TEXAS BUSINESS AND COMMERCE CODE, A LAW THAT GIVES CONSUMERS SPECIAL RIGHTS AND PROTECTIONS. AFTER CONSULTATION WITH AN ATTORNEY OF TENANT'S OWN SELECTION, TENANT VOLUNTARILY CONSENTS TO THIS WAIVER.</b>"),
    ],
}


def lease_html(L):
    A = ASSETS[L["asset"]]
    st = STATE_NAMES[A["state"]]
    start, end, rows = rent_schedule(L)
    info, deposit = basic_info(L, A, start, end, rows)
    n = [1]
    out = [info]

    def sec(title, *paras):
        n[0] += 1
        body = "".join(f"<p><span class='sub'>{n[0]}.{i + 1}</span> {p}</p>" for i, p in enumerate(paras))
        out.append(f"<h2>{n[0]}. {e(title)}</h2>{body}")
        return n[0]

    sec("Premises",
        f"Landlord leases to Tenant, and Tenant leases from Landlord, the Premises described in Section 1, located in the building at {e(A['address'])}, {e(A['city'])}, {e(st)} (the \"Building\"), part of the project known as {e(L['asset'])} (the \"Project\"). The rentable area stated in Section 1 is agreed and is not subject to remeasurement.",
        "Tenant has the non-exclusive right to use the common areas of the Project in common with other tenants, subject to the Rules and Regulations.")
    sec("Term",
        f"The Term begins on the Commencement Date, {long_date(start)}, and ends on the Expiration Date, {long_date(end)}, unless terminated earlier or extended as provided in this Lease.",
        "If Landlord cannot deliver possession on the Commencement Date, this Lease remains in effect, Landlord is not liable for the delay, and the Commencement Date and Expiration Date are postponed day for day.")
    rent_note = (f"Base Rent increases by {money(L['step'])} per rentable square foot per year on each anniversary of the Commencement Date."
                 if L.get("step") else f"Base Rent increases by {L.get('escalation', 0):g}% on each anniversary of the Commencement Date.")
    rent_paras = [f"Tenant shall pay Base Rent in monthly installments, in advance, on the first day of each month, as follows. {rent_note}" + schedule_table(rows),
                  "Rent for any partial month is prorated on a daily basis. Any rent not received within five (5) days after its due date bears a late charge of five percent (5%) of the overdue amount."]
    if L.get("free_rent_months"):
        rent_paras.append(f"Base Rent (but not Tenant's Share of Operating Expenses) is abated for the first {words(L['free_rent_months'])} months of the Term. If an Event of Default occurs, all abated Base Rent becomes immediately due.")
    sec("Base Rent", *rent_paras)

    share = f"{tenant_share(L):.2f}%"
    if L["lease_type"] == "NNN":
        opex = [f"This is a triple net lease. In addition to Base Rent, Tenant shall pay Tenant's Share ({share}) of all Operating Expenses and Real Estate Taxes of the Project, in monthly estimated installments, reconciled annually.",
                "\"Operating Expenses\" means all costs of operating, maintaining, repairing and insuring the Project, including a property management fee, but excluding capital expenditures except those that reduce operating costs or are required by law, amortized over their useful life."]
    elif L["lease_type"] == "MG":
        opex = [f"This is a modified gross lease. Base Rent includes Operating Expenses and Real Estate Taxes for calendar year {L['base_year']} (the \"Base Year\"). For each later calendar year, Tenant shall pay Tenant's Share ({share}) of the amount by which Operating Expenses and Real Estate Taxes exceed those of the Base Year.",
                "Tenant shall pay directly for electricity and gas consumed in the Premises, which are separately metered, and for janitorial service within the Premises."]
    else:
        opex = ["This is a gross lease. Base Rent includes all Operating Expenses and Real Estate Taxes of the Project, and Tenant has no obligation to pay any share of them.",
                "Tenant shall pay directly for electricity, gas and telecommunications consumed in the Premises, which are separately metered."]
    if L["lease_type"] != "Gross":
        opex.append(f"The property management fee included in Operating Expenses shall not exceed {e(L['mgmt_fee_cap'])}.")
        opex.append(f"Operating expense cap: {e(L['opex_cap'])}. Real Estate Taxes, insurance and utilities are not Controllable Operating Expenses." if L.get("opex_cap") else "Operating Expenses are not subject to any cap.")
        opex.append(f"Tenant may audit Landlord's books for any year's Operating Expenses by written notice given within {words(L['audit_days'])} days after receiving Landlord's annual statement. If the audit shows that Operating Expenses were overstated by more than 3%, Landlord shall pay the reasonable cost of the audit.")
    sec("Operating Expenses and Recoveries", *opex)

    sec("Security Deposit",
        f"On signing this Lease, Tenant shall deposit {money(deposit)} with Landlord as security for Tenant's performance (the \"Security Deposit\"). The Security Deposit is not prepaid rent and is not a limit on Landlord's damages.",
        "If Landlord applies any part of the Security Deposit to cure a default, Tenant shall restore it to its full amount within ten (10) days after demand. State-specific provisions on the Security Deposit appear in the State-Specific Provisions section.")

    use = [f"Tenant shall use the Premises only for {e(L['permitted_use'])} (the \"Permitted Use\"), and for no other purpose.",
           f"Tenant shall not use the Premises for {e(L['prohibited'])}."]
    if L.get("exclusive"):
        use.append(f"Exclusive use: {e(L['exclusive'])}, so long as Tenant is not in default and is operating for the Permitted Use.")
    else:
        use.append("Tenant has no exclusive right to conduct any business in the Project.")
    use.append(f"Co-tenancy: {e(L['co_tenancy'])}." if L.get("co_tenancy") else "Tenant's obligations under this Lease are not conditioned on the occupancy or operation of any other tenant.")
    sec("Use", *use)

    hz = [e(L["hazmat"]),
          "\"Hazardous Materials\" means any substance regulated by any Environmental Law, including petroleum products, asbestos and polychlorinated biphenyls. \"Environmental Laws\" means all federal, state and local laws relating to health, safety or the environment.",
          e(L["env_indemnity"]), e(L["remediation"])]
    if L.get("hazmat_baseline"):
        hz.append(f"Baseline: {e(L['hazmat_baseline'])}.")
    sec("Hazardous Materials", *hz)

    m = L["maintenance"]
    cap = L.get("maintenance_cap") or m.get("cap", "None")
    matrix = ("<table class='grid'><thead><tr><th>Item</th><th>Responsible party</th></tr></thead><tbody>"
              + "".join(f"<tr><td>{k}</td><td>{e(v)}</td></tr>" for k, v in [("Roof", m["roof"]), ("Structure", m["structure"]), ("HVAC", m["hvac"]), ("Parking, truck court and yard", m["parking"]), ("Interior of the Premises", m["interior"])])
              + "</tbody></table>")
    sec("Maintenance and Repairs",
        "Responsibility for maintenance, repair and replacement is allocated as follows:" + matrix,
        f"Caps on Tenant's repair obligations: {e(cap)}.",
        "Tenant shall keep the Premises clean and in good order, and shall promptly notify Landlord of any condition that Landlord is responsible for repairing.")
    sec("Alterations",
        "Tenant shall not make any alterations, additions or improvements to the Premises (\"Alterations\") without Landlord's prior written consent, except non-structural interior Alterations costing less than $10,000 in the aggregate in any year, which require only prior notice.",
        "All Alterations shall be made by licensed contractors approved by Landlord, in a good and workmanlike manner, in compliance with all laws, and free of liens.")

    ti = [f"Landlord's work: {e(L['landlord_work'])}"]
    if L.get("ti_allowance_psf"):
        total = L["ti_allowance_psf"] * L["rsf"]
        unpaid = total - L.get("ti_paid", 0)
        ti.append(f"Landlord shall provide an improvement allowance of {money(L['ti_allowance_psf'])} per rentable square foot ({money(total)}) for improvements approved by Landlord. As of the date of this Lease, {money(L.get('ti_paid', 0))} has been disbursed and {money(unpaid)} remains available.")
        if L.get("ti_deadline"):
            ti.append(f"Tenant must request disbursement of the allowance, with invoices and lien releases, by {long_date(L['ti_deadline'])}; any portion not requested by that date is forfeited.")
    else:
        ti.append("Landlord provides no improvement allowance.")
    sec("Improvements and Allowance", *ti)

    ins = [f"Tenant shall carry, at its cost: (a) commercial general liability insurance of at least {e(L['gl_limit'])}; (b) umbrella or excess liability insurance of at least {e(L['umbrella'])}; (c) property insurance covering the {e(L['property_ins'])}; (d) business automobile liability insurance of at least {e(L['auto_limit'])}; and (e) workers' compensation insurance as required by law."]
    if L.get("pollution"):
        ins.append(e(L["pollution"]) + ".")
    ins += ["Landlord, its property manager and its lender shall be named as additional insureds on Tenant's liability policies. Tenant shall deliver certificates of insurance before the Commencement Date and on each renewal.",
            "Landlord and Tenant each waive all rights of recovery against the other for any loss covered (or required to be covered) by their property insurance, and each shall cause its insurers to waive subrogation accordingly."]
    sec("Insurance and Waiver of Subrogation", *ins)
    sec("Indemnity", "Tenant shall indemnify, defend and hold Landlord harmless from all claims arising from Tenant's use of the Premises or the acts or omissions of Tenant or its agents, except to the extent caused by Landlord's negligence or willful misconduct.")
    sec("Assignment and Subletting", e(L["assignment"]),
        "No assignment or sublease releases Tenant or any Guarantor from liability under this Lease.")

    ops = [f"Operating hours: Tenant may access and operate in the Premises {e(L['hours'])}.",
           f"Parking: Tenant shall have {e(L['parking'])}."]
    ops.append(f"Truck court and yard: Tenant shall have {e(L['yard'])}." if L.get("yard") else "Truck court and yard: Tenant may use the truck court only for loading and unloading, and may not park trailers overnight.")
    ops.append(f"Outside storage: Tenant may use {e(L['outside_storage'])}, kept neat and screened as Landlord reasonably requires." if L.get("outside_storage") else "Outside storage: No outside storage of any kind is permitted.")
    ops.append(f"Signage: Tenant may install {e(L['signage'])}. All signs shall be removed at the end of the Term and the surfaces repaired.")
    sec("Operations, Parking and Signage", *ops)

    if L.get("renewal"):
        r = L["renewal"]
        sec("Renewal Option",
            f"Tenant has {words(r['count'])} option{'s' if r['count'] > 1 else ''} to extend the Term for {words(r['years'])} years each, exercisable by written notice to Landlord given at least {words(r['notice_months'])} months before the then-scheduled Expiration Date, provided Tenant is not then in default and occupies the entire Premises.",
            f"Base Rent for each extension term shall be {e(r['basis'])}. \"Fair Market Rent\" means the rent then being agreed for comparable space in comparable buildings in the {e(A['city'])} market, taking into account all concessions. If the parties do not agree within thirty (30) days, it shall be set by baseball arbitration between two brokers.",
            "The options are personal to the original Tenant and lapse if not exercised on time.")
    else:
        sec("Renewal Option", "Tenant has no option to extend the Term.")

    if L.get("termination"):
        t = L["termination"]
        notice_by = d(t["effective"]) - relativedelta(months=t["notice_months"])
        sec("Early Termination",
            f"Tenant may terminate this Lease effective {long_date(t['effective'])} (the \"Early Termination Date\") by written notice to Landlord given no later than {long_date(notice_by)}, being at least {words(t['notice_months'])} months before the Early Termination Date.",
            f"With its notice, Tenant shall pay a termination fee equal to {e(t['fee'])}. The right lapses if not exercised on time or if Tenant is then in default.")
    else:
        sec("Early Termination", "Tenant has no right to terminate this Lease before the Expiration Date.")

    rights = []
    if L.get("rofr"):
        rights.append(f"Right of first refusal: If Landlord receives an acceptable offer to lease {e(L['rofr']['space'])}, Landlord shall first offer it to Tenant on the same terms, and Tenant shall have {words(L['rofr']['response_days'])} business days to accept in writing.")
    if L.get("rofo"):
        rights.append(f"Right of first offer: Before marketing {e(L['rofo']['space'])} to third parties, Landlord shall offer it to Tenant, who shall have {words(L['rofo']['response_days'])} business days to accept the offered terms in writing.")
    if L.get("expansion"):
        rights.append(f"Expansion option: {e(L['expansion'])}.")
    if L.get("relocation"):
        rights.append("Relocation: Once during the Term, on at least ninety (90) days' notice, Landlord may relocate Tenant to other premises in the Project of substantially similar size and utility. Landlord shall pay Tenant's reasonable moving costs and the cost of improving the new premises to a comparable standard, and Base Rent shall not increase.")
    if not rights:
        rights.append("Tenant has no right of first refusal, right of first offer or expansion option, and Landlord has no right to relocate Tenant.")
    sec("Expansion, First Rights and Relocation", *rights)

    sec("Default and Remedies",
        f"Each of the following is an \"Event of Default\": (a) Tenant fails to pay any rent within {words(L['tenant_monetary_cure_days'])} days after written notice that it is past due; (b) Tenant fails to perform any other obligation within {words(L['tenant_nonmonetary_cure_days'])} days after written notice (or longer, if the failure cannot reasonably be cured in that time and Tenant diligently pursues the cure); or (c) Tenant becomes insolvent or abandons the Premises.",
        "After an Event of Default, Landlord may terminate this Lease or Tenant's right to possession, recover all damages allowed by law, and pursue any other remedy available under the laws of the State of " + e(st) + ".",
        f"Landlord is in default only if it fails to perform an obligation within {words(L['landlord_cure_days'])} days after written notice from Tenant (or longer, if the failure cannot reasonably be cured in that time and Landlord diligently pursues the cure).")
    sec("Holdover", f"If Tenant remains in possession after the end of the Term without Landlord's written consent, Tenant is a tenant at sufferance and shall pay Base Rent at {L['holdover_pct']}% of the rate in effect at the end of the Term, prorated daily, plus all other charges, and shall be liable for Landlord's damages if Tenant holds over for more than thirty (30) days.")
    sec("Subordination, SNDA and Estoppel",
        f"This Lease is subordinate to any existing or future mortgage on the Project, provided the lender agrees not to disturb Tenant's possession while Tenant is not in default. Tenant shall sign a commercially reasonable subordination, non-disturbance and attornment agreement (SNDA) within {words(L['snda_days'])} days after request.",
        f"Within {words(L['estoppel_days'])} days after Landlord's request, Tenant shall deliver a signed estoppel certificate confirming the status of this Lease.")
    sec("Surrender and Restoration",
        "At the end of the Term, Tenant shall surrender the Premises broom clean and in good condition, reasonable wear and tear and casualty excepted.",
        e(L["restoration"]))
    if L.get("guarantor"):
        sec("Guaranty", f"As a condition of this Lease, {e(L['guarantor'])} shall sign the guaranty attached as Exhibit C.")
    sec("Notices", f"Notices shall be in writing and delivered by hand, overnight courier or certified mail to Landlord at c/o Model Fund I (fictional), 100 Example Plaza, Suite 1000, and to Tenant at the Premises. Notices are effective on delivery or refusal.")
    state_paras = [f"<b>{e(t)}.</b> {p}" for t, p in STATE_TEXT[A["state"]]]
    sec(f"State-Specific Provisions ({st})", *state_paras)
    sec("Miscellaneous",
        f"This Lease is governed by the laws of the State of {e(st)}. Time is of the essence. This Lease, with its exhibits, is the entire agreement of the parties and may be amended only in writing signed by both of them.",
        "Exhibits: A – Premises plan; B – Outside storage or yard area (if any); C – Guaranty (if any); D – Environmental baseline (if any); E – Rules and Regulations. (Exhibits are not included in this sample.)")

    title = f"Industrial Lease — {L['asset']}, {L['suite']}"
    sig = signature_block(L, d(L["commencement"]) - relativedelta(months=2))
    return page(title, f"<p class='lead'>This Industrial Lease is made as of {long_date(d(L['commencement']) - relativedelta(months=2))} between the Landlord and the Tenant named in Section 1. This document is fictional and was created for software testing; it is not a legal form and is not legal advice.</p>" + "".join(out) + sig)


def signature_block(L, dated):
    tenant = L["tenant"].split(",")[0]
    return ("<h2>Signatures</h2><table class='sig'><tr>"
            f"<td><b>LANDLORD</b><br>{e(L['landlord'])}<br><br>By: ______________________<br>Name: A. Sample (fictional)<br>Title: Authorized Signatory<br>Date: {long_date(dated)}</td>"
            f"<td><b>TENANT</b><br>{e(tenant)}<br><br>By: ______________________<br>Name: B. Example (fictional)<br>Title: President<br>Date: {long_date(dated)}</td>"
            "</tr></table>")


def amendment_html(L):
    am = L["amendment"]
    A = ASSETS[L["asset"]]
    tenant = L["tenant"].split(",")[0]
    paras = "".join(f"<h2>{i + 1}. {e(t)}</h2><p>{e(p)}</p>" for i, (t, p) in enumerate(am["changes"]))
    k = len(am["changes"])
    body = (f"<p class='lead'>This {e(am['title'])} (this \"Amendment\") is made as of {long_date(am['date'])} between {e(L['landlord'])} (\"Landlord\") and {e(L['tenant'])} (\"Tenant\"). This document is fictional and was created for software testing.</p>"
            f"<h2>Recitals</h2><p>A. Landlord and Tenant are parties to an Industrial Lease dated {long_date(d(L['commencement']) - relativedelta(months=2))} (the \"Lease\") for {e(L['suite'])} of {e(L['asset'])}, {e(A['address'])}, {e(A['city'])}, {e(STATE_NAMES[A['state']])}.</p>"
            f"<p>B. {e(am['recital'])}</p><p>The parties therefore agree as follows. Capitalized terms not defined here have the meanings given in the Lease.</p>"
            + paras
            + f"<h2>{k + 1}. Ratification</h2><p>Except as modified by this Amendment, the Lease remains unchanged and in full force. If this Amendment conflicts with the Lease, this Amendment controls.</p>"
            + signature_block({"landlord": L["landlord"], "tenant": L["tenant"]}, d(am["date"])))
    return page(f"{am['title']} — {L['asset']}, {L['suite']} ({tenant})", body)


def page(title, body):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{e(title)}</title>
<style>
@page {{ size: Letter; margin: 0.9in 0.85in; }}
body {{ font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.45; color: #111; }}
.mark {{ text-align: center; font: bold 8.5pt Arial, sans-serif; letter-spacing: .06em; color: #b42318; border: 1.5px solid #b42318; padding: 4px; margin-bottom: 14px; }}
h1 {{ font-size: 16pt; text-align: center; margin: 4px 0 2px; }}
h2 {{ font-size: 11pt; margin: 16px 0 4px; text-transform: uppercase; letter-spacing: .02em; }}
p {{ margin: 0 0 7px; text-align: justify; }}
.sub {{ font-weight: bold; margin-right: 4px; }}
.lead {{ font-style: italic; }}
table {{ border-collapse: collapse; width: 100%; margin: 6px 0 8px; font-size: 9.5pt; }}
table.info th {{ text-align: left; width: 28%; vertical-align: top; padding: 3px 8px 3px 0; border-bottom: 1px solid #ddd; }}
table.info td {{ padding: 3px 0; border-bottom: 1px solid #ddd; }}
table.grid th, table.grid td {{ border: 1px solid #999; padding: 3px 6px; text-align: left; }}
table.grid th {{ background: #f2f2f2; }}
td.n {{ text-align: right; font-variant-numeric: tabular-nums; }}
table.sig td {{ width: 50%; vertical-align: top; padding-top: 8px; }}
</style></head><body>
<div class="mark">{WATERMARK}</div>
<h1>{e(title)}</h1>
{body}
</body></html>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    for raw in LEASES:
        L = {**BASE, **raw}
        A = ASSETS[L["asset"]]
        start, end, rows = rent_schedule(L)
        with open(os.path.join(OUT, f"{L['file']}.html"), "w") as f:
            f.write(lease_html(L))
        entry = dict(asset=L["asset"], state=A["state"], city=A["city"], address=A["address"], zip=A["zip"],
                     suite=L["suite"], rsf=L["rsf"], tenant=L["tenant"].split(",")[0], lease_type=L["lease_type"],
                     commencement=start.isoformat(), expiration=end.isoformat(), rate=rows[0][2],
                     files=[f"{L['file']}.pdf"])
        if L.get("fund_unit"):
            # 1.1.13: what the estoppel, tenant certificate and CAM reconciliation
            # (scripts/sample-deal-docs/deal_docs.py) need from this lease.
            first_paying = next(r for r in rows if r[3] > 0)
            entry["fund"] = dict(unit=L["fund_unit"]["name"], lease_date=(start - relativedelta(months=2)).isoformat(), landlord=L["landlord"],
                                 deposit=L["deposit_amount"] if L.get("deposit_amount") is not None else round(first_paying[3] * L["deposit_months"], 2),
                                 share_pct=round(tenant_share(L), 2), mgmt_fee_cap=L["mgmt_fee_cap"], gl_limit=L["gl_limit"], umbrella=L["umbrella"], auto_limit=L["auto_limit"],
                                 schedule=[dict(start=r[0].isoformat(), end=r[1].isoformat(), rate=r[2], monthly=r[3]) for r in rows],
                                 amendments=1 if L.get("amendment") else 0)
        if L.get("amendment"):
            with open(os.path.join(OUT, f"{L['amendment']['file']}.html"), "w") as f:
                f.write(amendment_html(L))
            entry["files"].append(f"{L['amendment']['file']}.pdf")
            entry["amendment"] = L["amendment"]["title"]
        index.append(entry)
    with open(os.path.join(ROOT, "docs", "sample-leases", "index.json"), "w") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f"{len(index)} leases, {sum(len(x['files']) for x in index)} documents")


if __name__ == "__main__":
    main()
