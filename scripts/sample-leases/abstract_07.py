"""First draft of the pilot abstract (the committed JSON is the version the
CREparser connector validated on 11/22/2026, draft b8158a5a…, after fixing
table-cell quotes and calculations):
Pilot abstract: Mill Creek Business Park — Snohomish Brewing Equipment Co.
(lease 07 + first amendment 07a), in the CREparser Lease Abstraction format.
Writes docs/sample-leases/abstracts/07-mill-creek-snohomish-brewing.json and
checks it the way the connector does: every quote must appear verbatim on its
page of the combined PDF (lease pages 1-6, amendment pages 7-8), and every
figure or date in a found value must appear in that item's quotes.
Usage: python3 abstract_07.py <lease.txt> <amendment.txt>  (pdftotext -layout)"""
import json, re, sys
from datetime import date

LEASE, AMEND = "lease", "amend1"
def ev(q, p): return {"quote": q, "page": p}
def F(key, value, status, clause=None, quotes=(), detail=None, calculation=None, governed_by=None, history=None, label=None, section=None):
    f = {"key": key, "value": value, "status": status}
    if label: f["label"] = label
    if section: f["section"] = section
    if clause: f["clause"] = clause
    if detail: f["detail"] = detail
    if calculation: f["calculation"] = calculation
    f["evidence"] = [ev(q, p) for q, p in quotes]
    if governed_by: f["governed_by"] = governed_by
    if history: f["history"] = history
    return f

fields = [
  F("landlord", "Model Fund I — Mill Creek LLC, a Delaware limited liability company", "found", "1", [("Model Fund I — Mill Creek LLC, a Delaware limited liability company", 1)]),
  F("tenant", "Snohomish Brewing Equipment Co., a Washington corporation", "found", "1", [("Snohomish Brewing Equipment Co., a Washington corporation", 1)]),
  F("tenant_business", "Stainless steel brewing equipment fabrication and repair", "calculated", "1, 7.1",
    [("fabrication, assembly and repair of stainless steel brewing equipment", 2)],
    calculation="Permitted use \"fabrication, assembly and repair of stainless steel brewing equipment\" → business: stainless steel brewing equipment fabrication and repair",
    label="Tenant business", section="parties"),
  F("sic_code", "3443 — Fabricated plate work (boiler shops)", "calculated", "7.1",
    [("fabrication, assembly and repair of stainless steel brewing equipment", 2)],
    calculation="Business: fabrication of stainless steel brewing equipment (tanks and vessels) → SIC 3443 Fabricated plate work (boiler shops)",
    label="SIC code", section="use"),
  F("guarantor", "None", "found", "1", [("Guarantor                      None", 1)]),
  F("property", "Mill Creek Business Park, 11500 Mill Creek Loop, Everett, Washington 98204", "found", "1",
    [("Mill Creek Business Park, 11500 Mill Creek Loop, Everett, Washington 98204", 1)]),
  F("premises", "Building 2, Suite 120", "found", "1", [("Building 2, Suite 120, containing approximately 2,300 rentable square feet", 1)]),
  F("rentable_area", "2,300 rentable square feet (not subject to remeasurement)", "found", "1, 2.1",
    [("Building 2, Suite 120, containing approximately 2,300 rentable square feet", 1), ("is agreed and is not subject to remeasurement", 1)]),
  F("pro_rata_share", "4.60% (of 50,000 RSF building)", "found", "1, 5.1", [("Tenant's Share                 4.60%", 1), ("Building area                  50,000 rentable square feet", 1)]),
  F("lease_date", "February 1, 2020", "found", "Preamble", [("This Industrial Lease is made as of February 1, 2020", 1)]),
  F("lease_type", "Triple net (NNN)", "found", "1, 5.1", [("Lease type                     Triple net (NNN)", 1)]),
  F("amendments", "First Amendment to Lease (Extension) dated May 20, 2026", "found", "Amendment preamble",
    [("This First Amendment to Lease (Extension) (this \"Amendment\") is made as of May 20, 2026", 7)]),
  F("term_length", "84 months, extended by 60 months (April 1, 2027 – March 31, 2032)", "found", "Amendment 1",
    [("The Term is extended for sixty (60) months, from April 1, 2027 through March 31, 2032", 7)], governed_by=AMEND,
    history=[{"value": "eighty-four (84) months", "document": LEASE, "evidence": [ev("eighty-four (84) months", 1)]}]),
  F("commencement_date", "April 1, 2020", "found", "1, 3.1", [("Commencement Date              April 1, 2020", 1)]),
  F("rent_commencement_date", "Same as the Commencement Date, April 1, 2020 (no free rent)", "found", "4.1",
    [("April 1, 2020        March 31, 2021          $12.50", 2)]),
  F("expiration_date", "March 31, 2032", "found", "Amendment 1",
    [("The Term is extended for sixty (60) months, from April 1, 2027 through March 31, 2032", 7)], governed_by=AMEND,
    history=[{"value": "March 31, 2027", "document": LEASE, "evidence": [ev("Expiration Date                March 31, 2027", 1)]}]),
  F("base_rent", "$15.25/RSF/yr ($2,922.92/month) from April 1, 2027; currently $14.93/RSF ($2,861.58/month) through March 31, 2027", "found", "4.1; Amendment 2",
    [("Base Rent for the Extended Term is $15.25 per rentable square foot per year ($2,922.92 per month) from April 1,", 7),
     ("April 1, 2026        March 31, 2027          $14.93                                           $2,861.58", 2)], governed_by=AMEND,
    history=[{"value": "$12.50 per rentable square foot per year", "document": LEASE, "evidence": [ev("$12.50 per rentable square foot per year, as scheduled in Section 4", 1)]}]),
  F("rent_escalations", "3.5% on each April 1 during the Extended Term", "found", "4.1; Amendment 2",
    [("increasing by 3.5% on each April 1 thereafter", 7)], governed_by=AMEND,
    history=[{"value": "3% on each anniversary of the Commencement Date", "document": LEASE, "evidence": [ev("Base Rent increases by 3% on each anniversary of the Commencement Date.", 2)]}]),
  F("rent_abatement", "Not addressed", "not_in_lease"),
  F("late_charge", "5% of the overdue amount if not received within 5 days after due", "found", "4.2",
    [("Any rent not received within five (5) days after its", 2), ("due date bears a late charge of five percent (5%) of the overdue amount.", 2)]),
  F("security_deposit", "$2,395.83; restore within 10 days after demand; return within 30 days after surrender", "found", "1, 6.1, 6.2, 24.2",
    [("Tenant shall deposit $2,395.83 with Landlord", 2), ("within ten (10) days after demand", 2), ("unapplied balance to Tenant within thirty (30) days after the expiration of the Term", 6)]),
  F("letter_of_credit", "Not addressed", "not_in_lease"),
  F("guaranty", "None", "found", "1", [("Guarantor                      None", 1)]),
  F("renewal_option", "None — the renewal option was deleted by the First Amendment", "found", "16; Amendment 3",
    [("Section 16 (Renewal Option) of the Lease is deleted in its entirety. Tenant has no further right to extend the Term.", 7)], governed_by=AMEND,
    history=[{"value": "One 5-year option at 95% of Fair Market Rent, on at least 9 months' notice", "document": LEASE,
              "evidence": [ev("Tenant has one (1) option to extend the Term for five (5) years each", 5), ev("given at least nine (9) months before the then-scheduled Expiration Date", 5), ev("Base Rent for each extension term shall be 95% of the Fair Market Rent", 5)]}]),
  F("termination_option", "None", "found", "17.1", [("Tenant has no right to terminate this Lease before the Expiration Date.", 5)]),
  F("expansion_rights", "Right of first offer on Suite 130 (about 1,500 RSF) during the Extended Term; 15 days to accept in writing", "found", "18.1; Amendment 4",
    [("before leasing Suite 130 (approximately 1,500 rentable square feet) to a third party,", 7), ("who shall have fifteen (15) days to accept the offer in writing", 7)], governed_by=AMEND,
    history=[{"value": "No right of first refusal, right of first offer or expansion option", "document": LEASE, "evidence": [ev("Tenant has no right of first refusal, right of first offer or expansion option", 5)]}]),
  F("purchase_option", "Not addressed", "not_in_lease"),
  F("permitted_use", "Fabrication, assembly and repair of stainless steel brewing equipment, with related office use", "found", "1, 7.1",
    [("Tenant shall use the Premises only for fabrication, assembly and repair of stainless steel brewing equipment,", 2)]),
  F("exclusive_use", "None", "found", "7.3", [("Tenant has no exclusive right to conduct any business in the Project.", 3)]),
  F("co_tenancy", "None — obligations not conditioned on other tenants", "found", "7.4", [("Tenant's obligations under this Lease are not conditioned on the occupancy or operation of any other tenant.", 3)]),
  F("prohibited_uses", "Nuisance, odors or vibrations noticeable outside the Premises, or uses that raise Landlord's insurance premiums", "found", "7.2",
    [("emits odors or vibrations noticeable", 3), ("outside the Premises, or increases Landlord's insurance premiums", 3)]),
  F("hazardous_materials", "Only customary office / light industrial materials in small quantities; Tenant indemnifies (survives) and remediates releases it causes", "found", "8.1, 8.3, 8.4",
    [("Tenant may use only those Hazardous Materials customarily used in general office and light industrial", 3), ("This indemnity survives the expiration or termination of this Lease.", 3), ("Tenant shall promptly remediate, at its sole cost", 3)]),
  F("environmental_baseline", "Exhibit D, if any (not included)", "unclear", "25.2",
    [("D –", 6), ("Environmental baseline (if any)", 6)], detail="The exhibit list names an environmental baseline exhibit 'if any', and exhibits are not included, so it is unclear whether a baseline exists.",
    label="Environmental baseline", section="legal"),
  F("insurance_requirements", "CGL $1,000,000 / $2,000,000 aggregate; umbrella $2,000,000; property at replacement cost; auto $1,000,000; workers' comp; Landlord, manager and lender as additional insureds; mutual waiver of subrogation", "found", "12.1-12.3",
    [("commercial general liability insurance of at least $1,000,000 per", 4), ("occurrence and $2,000,000 in the aggregate", 4), ("umbrella or excess liability insurance of at least $2,000,000", 4),
     ("business automobile liability insurance of at least $1,000,000 combined single limit", 4), ("shall be named as additional insureds", 4), ("each shall cause its insurers to waive subrogation accordingly", 4)]),
  F("indemnification", "Tenant indemnifies Landlord for claims from its use or acts, except Landlord's negligence or willful misconduct", "found", "13.1",
    [("Tenant shall indemnify, defend and hold Landlord harmless from all claims arising from Tenant's use of the", 4)]),
  F("landlord_maintenance", "Roof, parking, truck court and yard as Operating Expenses; structure at Landlord's sole cost", "found", "9.1",
    [("Landlord, as an Operating Expense", 3), ("Landlord, at its sole cost (foundation, exterior walls and structural elements)", 3)]),
  F("tenant_maintenance", "Interior of the Premises (doors, dock levelers, plumbing and electrical) at Tenant's sole cost", "found", "9.1",
    [("Tenant, at its sole cost (doors, dock levelers, plumbing and electrical within the Premises)", 3)]),
  F("roof_structure", "Roof by Landlord as an Operating Expense; structure by Landlord at its sole cost", "found", "9.1",
    [("Roof                   Landlord, as an Operating Expense", 3), ("Landlord, at its sole cost (foundation, exterior walls and structural elements)", 3)]),
  F("hvac_maintenance", "Tenant under a quarterly service contract; Landlord replaces units at end of life, amortized as an Operating Expense", "found", "9.1",
    [("Tenant, under a quarterly service contract with a licensed contractor", 3), ("end of their useful life, amortized as an Operating Expense", 3)]),
  F("repair_caps", "None", "found", "9.2", [("Caps on Tenant's repair obligations: None.", 3)], label="Caps on tenant repairs", section="obligations"),
  F("operating_hours", "24 hours a day, 7 days a week", "found", "15.1", [("Tenant may access and operate in the Premises 24 hours a day, 7 days a week", 4)], label="Operating hours", section="use"),
  F("parking", "Non-exclusive, 1.5 spaces per 1,000 RSF", "found", "15.2", [("at a ratio of 1.5 spaces per", 4)]),
  F("truck_court_yard", "Exclusive use of one grade-level door and 600 SF of the truck court for staging", "found", "15.3",
    [("Tenant shall have exclusive use of one (1) grade-level door and the adjacent 600", 4)], label="Truck court and yard", section="use"),
  F("loading_docks", "One grade-level door (exclusive)", "found", "15.3", [("exclusive use of one (1) grade-level door", 4)]),
  F("signage", "One building-standard sign above the entry door, at Tenant's cost, subject to Landlord approval; removed at end of Term", "found", "15.5",
    [("Tenant may install one (1) building-standard sign above the entry door of the Premises", 4)]),
  F("outdoor_storage", "Not permitted", "found", "15.4", [("No outside storage of any kind is permitted.", 4)]),
  F("operating_expenses", "Triple net: Tenant pays 4.60% of Operating Expenses and Real Estate Taxes, monthly estimates reconciled annually", "found", "5.1, 5.2",
    [("Tenant shall pay Tenant's Share (4.60%) of all Operating", 2)]),
  F("real_estate_taxes", "Included in Tenant's Share; Tenant also pays taxes on its leasehold interest and property", "found", "5.1, 24.3",
    [("Expenses and Real Estate Taxes of the Project", 2), ("Tenant shall pay any tax imposed on its leasehold interest", 6)]),
  F("expense_cap", "None", "found", "5.4", [("Operating Expenses are not subject to any cap.", 2)]),
  F("management_fee", "Capped at 4% of gross revenues", "found", "5.3", [("shall not exceed 4% of gross revenues", 2)]),
  F("audit_rights", "Notice within 120 days after the annual statement; Landlord pays if overstated by more than 3%", "found", "5.5",
    [("hundred twenty (120) days after receiving Landlord's annual statement", 2), ("overstated by more than 3%, Landlord shall pay the reasonable cost of the audit", 2)]),
  F("base_year", "Not addressed (triple net)", "not_in_lease"),
  F("subordination", "Subordinate to mortgages with non-disturbance; SNDA within 15 days after request", "found", "21.1",
    [("subordination, non-disturbance and attornment agreement (SNDA) within fifteen (15) days after request", 5)]),
  F("estoppel", "Within 10 days after request", "found", "21.2", [("Within ten (10) days after Landlord's request, Tenant shall deliver a signed estoppel certificate", 5)]),
  F("default_cure", "Monetary: 5 days after written notice; non-monetary: 30 days (longer if diligently pursued); insolvency or abandonment", "found", "19.1",
    [("Tenant fails to pay any rent within five (5) days after", 5), ("written notice that it is past due", 5), ("Tenant fails to perform any other obligation within thirty (30) days after", 5)]),
  F("landlord_default_cure", "30 days after written notice (longer if diligently pursued)", "found", "19.3",
    [("Landlord is in default only if it fails to perform an obligation within thirty (30) days after written notice", 5)], label="Landlord default and cure", section="legal"),
  F("holdover", "Tenant at sufferance at 150% of the last Base Rent; liable for damages after 30 days", "found", "20.1",
    [("shall pay Base Rent at 150% of the rate in effect at the end of the Term", 5), ("holds over for more than thirty (30)", 5)]),
  F("relocation_right", "None", "found", "18.1", [("Landlord has no right to", 5), ("relocate Tenant", 5)]),
  F("assignment_subletting", "Landlord consent, not unreasonably withheld; Landlord may recapture and takes 50% of any transfer premium; Tenant not released", "found", "14.1, 14.2",
    [("which shall not be unreasonably withheld, conditioned or delayed", 4), ("Landlord may recapture the space", 4), ("is entitled to 50% of any transfer premium", 4)]),
  F("governing_law", "Washington", "found", "25.1", [("This Lease is governed by the laws of the State of Washington.", 6)]),
  F("notices", "In writing by hand, overnight courier or certified mail; Landlord c/o Model Fund I, Tenant at the Premises", "found", "23.1",
    [("Notices shall be in writing and delivered by hand, overnight courier or certified mail", 6)]),
  F("ti_allowance", "Refurbishment allowance $3.00/RSF ($6,900.00), to be requested by December 31, 2027 (none under the original lease)", "found", "11.2; Amendment 5",
    [("Landlord shall provide a refurbishment allowance of $3.00 per rentable square foot ($6,900.00), to be requested", 7), ("by December 31, 2027", 7)], governed_by=AMEND,
    history=[{"value": "No improvement allowance", "document": LEASE, "evidence": [ev("Landlord provides no improvement allowance.", 4)]}]),
  F("ti_unpaid_balance", "$6,900.00 (refurbishment allowance not yet requested; deadline December 31, 2027)", "calculated", "Amendment 5",
    [("Landlord shall provide a refurbishment allowance of $3.00 per rentable square foot ($6,900.00), to be requested", 7)],
    calculation="$3.00 × 2,300 RSF = $6,900.00 allowance; no draw recorded in the documents → unpaid balance $6,900.00",
    label="Unpaid allowance balance", section="obligations"),
  F("landlord_work", "None; Premises accepted AS IS with building systems in good working order", "found", "11.1",
    [("Landlord's work: None. Tenant accepts the Premises in their \"AS IS\" condition", 4)], label="Landlord's work", section="obligations"),
  F("alterations", "Landlord consent required, except non-structural interior work under $10,000 a year (notice only)", "found", "10.1",
    [("non-structural interior Alterations costing less than $10,000 in the", 3)]),
  F("surrender", "Broom clean and in good condition, reasonable wear and tear and casualty excepted", "found", "22.1",
    [("Tenant shall surrender the Premises broom clean and in good condition", 6)]),
  F("restoration", "Remove trade fixtures, equipment and cabling and repair damage; approved Alterations stay unless Landlord elected removal when approving", "found", "22.2",
    [("Tenant shall remove its trade fixtures, equipment and cabling and repair any damage caused by the", 6), ("Tenant is not required to remove Landlord-approved Alterations", 6)],
    label="Restoration at surrender", section="obligations"),
]

# Rent schedule: lease rows (found) then the Extended Term (first year found, later years calculated at +3.5%).
lease_rows = [("2020-04-01","2021-03-31",12.50,2395.83,"April 1, 2020        March 31, 2021          $12.50                                           $2,395.83"),
  ("2021-04-01","2022-03-31",12.88,2468.67,"April 1, 2021        March 31, 2022          $12.88                                           $2,468.67"),
  ("2022-04-01","2023-03-31",13.26,2541.50,"April 1, 2022        March 31, 2023          $13.26                                           $2,541.50"),
  ("2023-04-01","2024-03-31",13.66,2618.17,"April 1, 2023        March 31, 2024          $13.66                                           $2,618.17"),
  ("2024-04-01","2025-03-31",14.07,2696.75,"April 1, 2024        March 31, 2025          $14.07                                           $2,696.75"),
  ("2025-04-01","2026-03-31",14.49,2777.25,"April 1, 2025        March 31, 2026          $14.49                                           $2,777.25"),
  ("2026-04-01","2027-03-31",14.93,2861.58,"April 1, 2026        March 31, 2027          $14.93                                           $2,861.58")]
rent = []
for i, (s, e, r, m, q) in enumerate(lease_rows):
    rent.append({"period": f"Lease Year {i+1}", "start": s, "end": e, "rate": r, "monthly_rent": m, "annual_rent": round(m*12, 2), "status": "found", "clause": "4.1", "evidence": [ev(q, 2)]})
rate = 15.25
for y in range(5):
    s, e = f"{2027+y}-04-01", f"{2028+y}-03-31"
    r = 15.25 * 1.035 ** y
    m = round(r * 2300 / 12, 2)
    row = {"period": f"Extended Term Year {y+1}", "start": s, "end": e, "rate": round(r, 2), "monthly_rent": m if y else 2922.92, "annual_rent": round((m if y else 2922.92) * 12, 2), "clause": "Amendment 2", "governed_by": AMEND}
    if y == 0:
        row.update(status="found", evidence=[ev("Base Rent for the Extended Term is $15.25 per rentable square foot per year ($2,922.92 per month) from April 1,", 7), ev("The Term is extended for sixty (60) months, from April 1, 2027 through March 31, 2032", 7)])
    else:
        row.update(status="calculated", calculation=f"$15.25 × 1.035^{y} = ${r:.4f}/RSF → ${r:.2f}; × 2,300 RSF ÷ 12 = ${m:,.2f}/month; period April 1, {2027+y} + 12 months − 1 day = March 31, {2028+y}",
                   evidence=[ev("increasing by 3.5% on each April 1 thereafter", 7), ev("Base Rent for the Extended Term is $15.25 per rentable square foot per year ($2,922.92 per month) from April 1,", 7)])
    rent.append(row)

critical = [
  {"date": "2020-02-01", "kind": "lease_date", "label": "Lease signed", "status": "found", "clause": "Preamble", "evidence": [ev("This Industrial Lease is made as of February 1, 2020", 1)]},
  {"date": "2020-04-01", "kind": "commencement", "label": "Commencement", "status": "found", "clause": "1, 3.1", "evidence": [ev("Commencement Date              April 1, 2020", 1)]},
  {"date": "2026-05-20", "kind": "other", "label": "First Amendment signed", "status": "found", "clause": "Amendment preamble", "governed_by": AMEND, "evidence": [ev("is made as of May 20, 2026", 7)]},
  {"date": "2027-04-01", "kind": "rent_increase", "label": "Extended Term starts; rent to $15.25/RSF", "status": "found", "clause": "Amendment 1-2", "governed_by": AMEND,
   "action": "Bill the new rent ($2,922.92/month)", "evidence": [ev("Base Rent for the Extended Term is $15.25 per rentable square foot per year ($2,922.92 per month) from April 1,", 7), ev("from April 1, 2027 through March 31, 2032", 7)]},
  {"date": "2027-12-31", "kind": "other", "label": "Refurbishment allowance request deadline", "status": "found", "clause": "Amendment 5", "governed_by": AMEND,
   "notice": "Tenant must request the allowance by this date", "action": "Track the $6,900.00 allowance; it lapses if not requested", "evidence": [ev("by December 31, 2027", 7)]},
  {"date": "2032-03-31", "kind": "expiration", "label": "Expiration (no renewal option)", "status": "found", "clause": "Amendment 1, 3", "governed_by": AMEND,
   "action": "Plan re-leasing or a negotiated extension; Tenant has no renewal right", "evidence": [ev("from April 1, 2027 through March 31, 2032", 7), ev("Tenant has no further right to extend the Term.", 7)]},
]
for y in range(1, 5):
    critical.append({"date": f"{2027+y}-04-01", "kind": "rent_increase", "label": f"Rent increase (+3.5%)", "status": "calculated", "clause": "Amendment 2", "governed_by": AMEND,
                     "calculation": f"April 1, 2027 + {y} year(s) = April 1, {2027+y}; rate ${15.25*1.035**y:.2f}/RSF", "evidence": [ev("increasing by 3.5% on each April 1 thereafter", 7)]})
critical.sort(key=lambda d: d["date"])

risks = [
  {"severity": "medium", "title": "Uncapped operating expenses", "clause": "5.4", "detail": "Operating Expenses have no cap, so the tenant bears all increases. Good for the landlord's recoveries; a cost-pressure point for the tenant at renewal.", "evidence": [ev("Operating Expenses are not subject to any cap.", 2)]},
  {"severity": "medium", "title": "Thin credit support", "clause": "1, 6.1", "detail": "No guarantor and a security deposit of one month's original rent ($2,395.83), now about 0.8 months at the current rent.", "evidence": [ev("Guarantor                      None", 1), ev("Tenant shall deposit $2,395.83 with Landlord", 2)]},
  {"severity": "medium", "title": "Environmental use: metal fabrication", "clause": "8.1-8.4", "detail": "Fabrication use with hazardous materials limited to customary light-industrial quantities. Tenant indemnity survives and Tenant remediates its releases, but no baseline exhibit is included (Exhibit D 'if any').", "evidence": [ev("This indemnity survives the expiration or termination of this Lease.", 3), ev("Environmental baseline (if any)", 6)]},
  {"severity": "low", "title": "No renewal option after 2032", "clause": "Amendment 3", "detail": "The amendment deleted the renewal option: the suite rolls on March 31, 2032 unless a new deal is negotiated (re-leasing risk, but also a mark-to-market opportunity).", "evidence": [ev("Section 16 (Renewal Option) of the Lease is deleted in its entirety.", 7)]},
  {"severity": "low", "title": "Right of first offer on Suite 130", "clause": "Amendment 4", "detail": "Before leasing Suite 130 to a third party during the Extended Term, Landlord must first offer it to Tenant and wait up to 15 days.", "evidence": [ev("Landlord shall first offer it to Tenant, who shall have fifteen (15) days to accept the offer in writing.", 7)]},
  {"severity": "low", "title": "Uncapped tenant repairs", "clause": "9.2", "detail": "No cap on tenant repair obligations for the interior, doors and dock levelers.", "evidence": [ev("Caps on Tenant's repair obligations: None.", 3)]},
]

abstract = {
  "title": "Snohomish Brewing Equipment Co. — Mill Creek Business Park, Bldg 2 Suite 120",
  "summary": "Triple-net industrial lease of 2,300 RSF to a stainless brewing equipment fabricator, signed February 1, 2020 for 84 months from April 1, 2020. The First Amendment (May 20, 2026) extends the term 60 months to March 31, 2032 at $15.25/RSF rising 3.5% a year, deletes the renewal option, adds a right of first offer on Suite 130 and a $6,900 refurbishment allowance.",
  "property_type": "industrial",
  "documents": [{"id": LEASE, "title": "Industrial Lease", "date": "2020-02-01", "start_page": 1, "end_page": 6},
                {"id": AMEND, "title": "First Amendment to Lease (Extension)", "date": "2026-05-20", "start_page": 7, "end_page": 8}],
  "fields": fields, "rent_schedule": rent, "critical_dates": critical, "risks": risks,
  "app": {"tenant_business": "Stainless steel brewing equipment fabrication and repair", "sic_code": "3443", "validated": False,
          "check": "local", "files": ["07-mill-creek-snohomish-brewing.pdf", "07a-mill-creek-snohomish-brewing-first-amendment.pdf"],
          "made_with": "Claude (pilot; quotes checked locally against the PDF text — not yet validated by the CREparser connector)"},
}

# ── Local check ──
pages = []
for path in sys.argv[1:3]:
    pages += open(path).read().split("\f")
pages = [p for p in pages if p.strip()]
norm = lambda s: re.sub(r"\s+", " ", s).strip()
P = [norm(p) for p in pages]
errs = []
def check(where, item, value=None):
    quotes = item.get("evidence", [])
    for q in quotes:
        nq = norm(q["quote"])
        hits = [i + 1 for i, p in enumerate(P) if nq in p]
        if not hits: errs.append(f"{where}: quote not found: {q['quote'][:70]}")
        elif q.get("page") and q["page"] not in hits: errs.append(f"{where}: quote on page {hits}, hint {q['page']}")
    if value and item.get("status") == "found":
        joined = " ".join(norm(q["quote"]) for q in quotes)
        for fig in re.findall(r"\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%", value):
            if fig not in joined: errs.append(f"{where}: figure {fig} not in quotes")
    if item.get("status") == "calculated" and not item.get("calculation"): errs.append(f"{where}: calculated without calculation")
for f in fields:
    check(f"field {f['key']}", f, f["value"])
    for h in f.get("history", []): check(f"history {f['key']}", h)
for r in rent: check(f"rent {r['period']}", r)
for d in critical: check(f"date {d['label']}", d)
for r in risks: check(f"risk {r['title']}", r)
print(f"{len(pages)} pages · {len(fields)} fields · {len(rent)} rent rows · {len(critical)} dates · {len(risks)} risks · {len(errs)} errors")
for e in errs: print(" -", e)
if not errs:
    abstract["app"]["check"] = f"local: all quotes found on their pages ({date.today().isoformat()})"
    out = "docs/sample-leases/abstracts/07-mill-creek-snohomish-brewing.draft.json"  # keep the validated file
    json.dump(abstract, open(out, "w"), indent=1, ensure_ascii=False)
    print("wrote", out)
