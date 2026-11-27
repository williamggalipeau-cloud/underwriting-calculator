# Sample leases (fictional, for testing)

**Every document here is invented** — parties, guarantors, addresses and figures — and each page is marked
"SAMPLE – FICTIONAL – FOR TESTING ONLY". They are original documents written for testing the lease
abstraction workflow, not copies of any published lease form, and not legal forms or legal advice.

One lease per Model Fund I asset (12), split across California, Nevada, Washington and Texas. Each follows
common industrial lease terms and includes provisions specific to its state (security deposit rules,
statutory notices and waivers). Three include a separate first amendment.

**1.1.13: the nine Model Fund I leases are written from the fund** (`scripts/sample-leases/leases.py`
reads `scripts/sample-deal-docs/fund.json`): each is for a tenant on its asset's rent roll, with that unit's
SF, type, expiration, rent and escalation, and their amendments change no economic term, so every lease ties
to the app (`tests/node/sampleTieOut.test.cjs`). Their abstracts are sample abstracts built from the lease
text by `build_fund.py`, not validated by the CREparser connector. The earlier leases (tenants that were not
on the rent rolls, amendments that change terms) are kept for the tests in `tests/fixtures/sample-leases`.

| # | Asset | Location (fictional address) | Premises | Tenant | Type | Term | Year-1 rent | Documents |
|---|---|---|---|---|---|---|---|---|
| 1 | Airport Flex Park | 6230 Runway Vista Drive, Las Vegas, NV 89119 | Unit 005, 2,000 SF | Blue Mesa Fulfillment | NNN | 2022-05-01 to 2027-04-30 | $17.94/SF | lease |
| 2 | Route 9 Small Bay | 21800 Valley Freight Way, Kent, WA 98032 | Unit 005, 2,300 SF | Sierra Coffee Roasters | NNN | 2022-03-17 to 2027-03-16 | $15.64/SF | lease |
| 3 | Harbor Light Industrial | 2715 Pier Junction Avenue, Long Beach, CA 90810 | Unit 005, 2,250 SF | Copper Canyon Tile & Stone | NNN | 2022-05-31 to 2027-05-30 | $17.19/SF | lease + first amendment (notices; no economic change) |
| 4 | Ridgeway Trade Center | 9400 Ridgeway Commerce Blvd, Fort Worth, TX 76177 | Unit 005, 2,000 SF | Riverbend Flooring | NNN | 2022-08-16 to 2027-08-15 | $15.52/SF | lease |
| 5 | Canal Street Workshops | 3120 Canal Street, Houston, TX 77003 | Unit 005, 2,000 SF | Prairie Glass & Glazing | NNN | 2023-03-16 to 2028-03-15 | $18.06/SF | lease |
| 6 | Mill Creek Business Park | 11500 Mill Creek Loop, Everett, WA 98204 | Unit 005, 2,250 SF | Harbor Precision Machining | NNN | 2022-07-15 to 2027-07-14 | $15.90/SF | lease + first amendment (notices; no economic change) |
| 7 | Southpoint Flex | 855 Southpoint Parkway, Henderson, NV 89074 | Unit 005, 2,100 SF | Desert Sky Print Shop | NNN | 2024-10-31 to 2027-10-30 | $16.99/SF | lease |
| 8 | Granite Ave Industrial | 15020 Granite Avenue, Fontana, CA 92335 | Unit 005, 2,150 SF | Granite Courier | NNN | 2023-01-16 to 2028-01-15 | $17.76/SF | lease |
| 9 | Lakeshore Service Center | 7300 Lakeshore Service Road, Dallas, TX 75228 | Unit 005, 2,200 SF | Bayline Auto Parts | NNN | 2022-11-14 to 2027-11-13 | $15.66/SF | lease + first amendment (notices; no economic change) |
| 10 | Eastside Distribution Hub | 4400 East Trent Logistics Drive, Spokane Valley, WA 99216 | Dock Suite D, 12,000 RSF | Inland Northwest Grocery Distributors LLC | NNN | 2024-07-01 – 2034-06-30 | $8.40/SF | [12-eastside-inland-northwest-grocery.pdf](12-eastside-inland-northwest-grocery.pdf) |
| 11 | Northgate Flex Center | 12650 Northgate Tech Circle, Austin, TX 78758 | Suite 150, 1,750 RSF | Hill Country Robotics Inc. | MG | 2025-08-01 – 2028-10-31 | $19.50/SF | [13-northgate-hill-country-robotics.pdf](13-northgate-hill-country-robotics.pdf) |
| 12 | Riverside Commerce Park | 6800 Arlington Commerce Park, Riverside, CA 92503 | Building A, Suite 400, 4,000 RSF | Citrus Belt Logistics | NNN | 2023-12-01 – 2028-11-30 | $13.20/SF | [14-riverside-citrus-belt-logistics.pdf](14-riverside-citrus-belt-logistics.pdf) |

By state: California 3, Nevada 2, Washington 3, Texas 4.

**What they test** (abstraction and review):
- Amendments that extend the term and reset rent (Mill Creek), add space (Harbor Light), and swap a termination right for a renewal option (Lakeshore).
- Lease types: NNN, modified gross with a base year, and gross.
- Critical dates within the next 12 months: renewal notices (Route 9), early termination notices (Ridgeway, Northgate), an expansion option deadline (Northgate), an improvement allowance deadline (Granite Ave).
- The extra abstract fields: permitted use and exclusives, hazardous materials and baselines, insurance limits, maintenance responsibilities and caps, operating hours / yard / outside storage / signage, expense caps and audit rights, SNDA / estoppel / cure periods / holdover / relocation, allowances, landlord work and restoration.
- Mismatches against the app: each asset's rent roll is generated (fictional tenants), so applying a lease's abstract creates or updates a unit and shows differences.

**Rebuild:** `python3 scripts/sample-leases/generate.py && node scripts/sample-leases/pdf.cjs` (lease data in `scripts/sample-leases/leases.py`).
