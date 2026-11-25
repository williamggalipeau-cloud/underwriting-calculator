# Sample disposition documents (fictional)

For version 1.1 (Claude reads disposition documents). One **BOV**, **LOI**,
**PSA** and **seller's closing statement** each for three Model Fund I assets:

| Asset | BOV (most likely) | LOI | PSA | Closing |
|---|---|---|---|---|
| Route 9 Small Bay | $14.6M (Fictional Industrial Advisors) | $14.4M, Example Logistics REIT | $14.5M, closing 1/29/2027 | $14.5M, net $4.74M |
| Harbor Light Industrial | $11.7M (Sample Coastal Brokerage) | $11.5M, Fictional Pacific Industrial Fund II (financing contingency) | $11.6M, closing 2/22/2027 | $11.55M, net $3.94M |
| Mill Creek Business Park | $17.8M (Example Northwest Capital Markets) | $17.6M, Demo Flex Owners LLC | $17.65M, closing 2/27/2027 | $17.65M, net $6.10M |

Every name, party and figure is made up; each page says **SAMPLE – FICTIONAL –
FOR TESTING ONLY**.

**To try them:**
1. **Start a sale.** Dispositions → Assets for Sale → Start sale on one of the assets.
2. **Upload the documents:**
   - the BOV and the PSA as sale documents;
   - the LOI on an offer (Offers);
   - the closing statement once the sale closes, or as a sale document.
3. **Review with Claude** on each document makes the prompt. Alternatively, paste the matching
   `abstracts/<name>.json` into **Save abstract** to skip Claude.
4. **Apply.** Tick the fields and apply them to the BOV, offer, contract or closing.

**Files:** the `*.pdf` documents, `abstracts/*.json` (what Claude should return), and
`html/` (the sources). They are regenerated with:

    python3 scripts/sample-deal-docs/disposition_docs.py
    node scripts/sample-deal-docs/print_html.cjs docs/sample-deal-docs/dispositions
