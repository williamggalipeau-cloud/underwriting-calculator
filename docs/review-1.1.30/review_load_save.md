# Review: data loading and saving (Baywise, at commit 725616a, sample data version 15)

Read-only review. Nothing in the repo was changed and no live database was touched. "Confirmed by script" means a Node script in this scratchpad folder ran the app's own functions and printed the result; "confirmed by reading" means the code path was traced line by line but not run in a browser.

Scripts: `/tmp/claude-0/-home-user-underwriting-calculator/35575dbe-b549-510c-b85a-27c9d8d4e33d/scratchpad/r1.cjs` (construction upload), `r3.cjs` (the load's asset steps, run twice and with user edits), `r4.cjs` (rent roll), `r5.cjs` (import from the old app), `r6.cjs` (version 14 to 15), `r7.cjs` (GP agreements), all in the same folder.

## Findings, most serious first

### 1. High: an edit made while a save is in flight is never saved, and the screen says "Saved"
- Where: `app/page.jsx:914-918` (`saveToDbNow`), `956-964` (`saveRecordsNow` → `clean()`), `687-719` (the change-tracking effect).
- Sequence: the 2-minute autosave (or any save) starts and sends the data as it was at that moment. While the request is out (longest on the first save of a session, when every asset is re-sent because the forward curve was re-anchored), the user types one more change. The effect sees unsaved data, but "unsaved" is already on, so it only sets a timer; because the 2 minutes are counted from the first unsaved edit, that timer is 1 second. When it fires, `saveToDbNow` returns at once, either because a save is running (`dbSaving`) or because `clean()` has just set `dirty: false`. `clean()` never looks at whether the data moved on during the save. Nothing re-arms the timer.
- What is lost: that last change stays on screen only. The bar shows "✓ Saved", the leave warning does not fire (`dirty` is false), and hiding or closing the tab saves nothing. It is saved only if the user happens to edit something else later in the same session.
- Status: confirmed by reading. Not run in a browser.
- Smallest fix: in `clean()`, compare `recordItems(recBase.current, savableRecords(latestData.current))` again; if anything is still different keep `dirty: true` and call the save again (or schedule it in 1 second). Same check after the old one-JSON save.

### 2. High: a construction invoice upload can show on screen and never be saved
- Where: `lib/construction.js:102` (`c.invoices = byCode.get(c.code)` changes the existing job object in place), used by `components/TiSpend.jsx:55`.
- Why it matters: the copy of each record that the app compares against (`recBase`) holds the same objects as the screen (it is set from the loaded rows at `page.jsx:814` and from the saved data at `:972`). A change made in place changes both, so the save sees no difference. The change log has the same blind spot (`lib/audit.js:104`, snapshots are by reference).
- Sequence: upload an invoice file on its own (the jobs are already in the app), with a file name that has no `YYYY-MM` in it, or the same month as the last upload. The invoices appear on Property Condition. No "Unsaved changes" bar, nothing is sent, and they are gone at the next open. If the file name carries a new month, `asOf` changes and the asset is saved, which hides the bug most of the time.
- Status: confirmed by script (`r1.cjs`: records to save = none for `asOf` "" and for the same month; the asset is saved only when the month changes).
- Smallest fix: in `importConstruction`, build new job objects (`merged = merged.map((c) => ... ? { ...c, invoices } : c)`) instead of assigning to `c`.
- Not done: a sweep of every component for other in-place changes to data on screen. A grep of `lib/` found only this one.

### 3. High (only if the banner is showing): "Import changes made in the old app" replaces the whole firm with an old copy, with no confirmation, and the banner comes back
- Where: `app/page.jsx:898-908` (`importFromOldApp`), button at `:2152`, banner test at `:818-819`.
- Sequence: the banner shows for an owner when the old app saved its single JSON after the move to record-by-record saving. One click, no question asked, writes every record back to that old JSON and marks every asset, portfolio and set of marks that is not in it as deleted (they go to Recently deleted; changed records are in the record history).
- Second problem: the import remembers itself by saving `importedFromVersion` in the settings record, but the screen state does not carry that field, so the next ordinary save writes settings without it. At the next open the banner is back, and a click then throws away everything done since.
- Status: confirmed by script (`r5.cjs`: an asset renamed in the new app goes back to its old name, an asset, a portfolio and marks added since are marked deleted, and the next save drops `importedFromVersion`). Whether your firm's data shows this banner today is not known: live data was off limits for this review. `tests/e2e/phaseQ.e2e.cjs:158-162` checks the first import only.
- Smallest fix: ask before importing and say what will be replaced; keep `importedFromVersion` (carry it in state, or keep unknown settings fields when saving); or remove the button if the old app can no longer save.

### 4. Medium to High: the automatic sample load switches on real GP agreements that are waiting to be checked
- Where: `app/page.jsx:1688-1698`.
- Sequence: the loop takes every document in the firm whose abstract is a GP agreement, not only the sample ones. An agreement uploaded for one of your own portfolios, read by Claude and still under "to check", is saved as checked, in the owner's name, the next time a release raises the sample data version. Only Model Fund I's GP parties are rebuilt (`:1721`), so the real portfolio's capital and promote split changes later, the next time any agreement of that portfolio is saved or removed (`reapplyPartners`, `:1776-1790`).
- Status: confirmed by script (`r7.cjs`, the app's own `agreementFromAbstract` and `saveAgreement`).
- Smallest fix: limit the loop to the sample agreements (file names in `manifest.gpAgreements`, or portfolios in Model Fund I and the two sample portfolios).

### 5. Medium: three things in the automatic load are still written from a copy made at the start (the 1.1.13 / 1.1.17 pattern)
The uploads take about a minute. Whatever the owner, or a colleague on another screen, changes in these places during that minute is replaced at the end, and then saved with no conflict.
- GP partners: built from `cur.gpPartners` (`page.jsx:1663`), passed through the uploads, then `setGpPartners(gp)` at `:1699` replaces the whole list. A partner or agreement added meanwhile is lost. The manual "Add sample GP partners" has the same shape (`:1755-1756`).
- Tenant credit on sample assets: `addSampleCredit(cur.deals)` at `:1624` builds each occupied unit's whole `credit` object; `mergeCreditUpdate` (`lib/sampleCredit.js:135`) writes that object onto the unit, and it is applied a second time at `:1707`. Confirmed by script (`r3.cjs`): a credit record, a flag and a credit setting added between the two passes are all gone; with a fresh copy the user's records are kept.
- Aged receivables on Model Fund I: `credit.delinquency` from the start is written at `:1721`. An aged receivables file uploaded to Model Fund I during the load is replaced by the sample months (confirmed by reading).
- Smallest fix: compute `credit` inside the updater from the assets as they are (`setDeals((prev) => { const credit = addSampleCredit(prev, …); … })`), have `mergeCreditUpdate` replace only the sample-authored records and flags, decide the delinquency inside `setFunds((prev) => …)`, and use `setGpPartners((prev) => …)` adding only the missing partners and agreements.

### 6. Medium: "Apply rent roll" blanks the lease start and business description of every changed unit, without showing or logging it
- Where: `lib/dealDocApply.js:386` and `:392` (`docUnit`), applied at `components/Documents.jsx:227`.
- Sequence: a rent roll abstract with no lease start or business for a unit, where the unit differs in any listed field (for example rent). The screen and the change log show only the rent change; the unit's `leaseStart` and `businessDescription` are set to "". Because the logged entries replace the generic comparison for that asset, the blanking is not in the change log either.
- Status: confirmed by script (`r4.cjs`).
- Smallest fix: `leaseStart: dateOf(u.lease_start) || base.leaseStart || ""` and `businessDescription: u.business ?? base.businessDescription ?? ""`.

### 7. Medium (two or more people): a colleague's save wipes your pending change-log rows; a small window can also undo your last keystrokes
- Where: `app/page.jsx:826-831` (`putRecord`), `848-864` (`applyRemote`).
- Change log: when another person's record arrives, `putRecord` sets `dbBaseline` to the screen as it is now, including your unsaved edits to other records. Your next save compares against that and sends no change rows for them. The data is saved; the database change log (the only lasting one, since the working log is not re-saved) never gets those rows, so Restore as of a date and Revert miss them. Confirmed by reading.
- Keystrokes: `putRecord` rebuilds the whole list from `latestData.current`, which is up to 150 ms behind the screen (longer while typing without a pause). An edit in that window is put back to the older value on screen. Confirmed by reading; small window.
- Smallest fix: in `putRecord` change only that record inside the baselines, and use functional updates (`setDealsRaw((prev) => …)`) for that one record.

### 8. Medium (sample fund only): a limit the user changed on Model Fund I is put back at every release
- Where: `lib/sampleDocTerms.js:56-66` (`sampleFundTermsPatch` with `keepExisting`), called at `app/page.jsx:1721`.
- A limit keeps the user's value only if it has a `docId`; the sample limits have none. Confirmed by script (`r3.cjs`): a limit changed from 20 to 15 comes back as 20, and a removed limit comes back.
- Smallest fix: with `keepExisting`, keep any limit already there by key and add only the missing keys.

### 9. Low: sample items the user removed or cleared on sample assets come back at each release
None of these touch a real asset. Confirmed by script or reading.
- A sample credit-change flag the user cleared is open again (`r3.cjs`); a corrected sample credit record is rewritten.
- A deleted sample sale, research item (`lib/sampleResearch.js:108`), tenant insurance record, Property Management section, sample prospect on a joint venture asset, and the two sample portfolios with their four assets and pipeline deals (`sampleVenturesToAdd`) are added again.
- `withSampleCmFeeBasis` (`lib/samplePortfolio.js:173`) has no version gate: a sample asset the user set back to the "value" basis at the default fee flips to "spend" again.
- A user's own internal mark on Airport Flex Park or Route 9 for 9/30/2026 is relabelled as an appraisal with a fictional appraiser (`page.jsx:1655-1659`); the value is unchanged.
- Smallest fix: gate each step on the version that introduced it (`fromVersion < N`), as `withSampleTermChanges` already does.

### 10. Low, unconfirmed: when one upload fails, every later open deletes and re-uploads the rewritten sample documents
- Where: `app/page.jsx:1674` with `lib/sampleDocs.js:267` and `lib/sampleDocChanges.json`.
- The version is stamped only when nothing failed, so the next open runs with the same starting version. Most file names in the change list are also the current file names (checked: 12 of 16 for version 3, all for 8, 12 and 14; 12 of 17 sale documents), so the copies added last time are hard-deleted (files and rows) and uploaded again with new ids, each open, until the failure clears. Anything pointing at a document id (`limits[].docId`, `loanTerms.docId`, `actualBasis.docId`) is left pointing at nothing. No failure was reproduced; no test covers a failed upload.
- Smallest fix: skip the removal for a document whose row was created after the version's release, or record the removal as done separately from the version.

### 11. Low: smaller save-path items (confirmed by reading)
- Sign out (`page.jsx:2171-2176`): if the save fails, or one is already running, sign-out and reload go ahead; up to 2 minutes of edits are lost (the browser's leave prompt appears, but the session is already gone).
- In the automatic load, `await saveRef.current?.()` (`:1672`) swallows errors and returns at once if another save is running, so the uploads can start with the asset changes unsaved, which is the 1.1.14 situation again.
- `putRecord` / `applyRecord` do not guard a live-update row that arrives without `data` (Supabase cuts very large payloads). Records measured here are 40 to 220 KB, well under the limit, so this is unlikely today. Unconfirmed.
- The conflict bar's "Open latest" (`:2011`) calls the old one-JSON loader. In record mode the `conflict` flag is never set, so it cannot be reached today.

## Checked and found sound
- The asset steps of the load are safe to run twice: on a current fund, a second pass changes nothing for starting versions 0, 2, 6, 7, 9, 11 and 14 (`r3.cjs`).
- Version 14 to 15 on assets shaped like version 14 (no projects, no unit use, one legacy capital line): projects total the Capex Budget, plan rows match, office SF adds up, on all 13 assets (`r6.cjs`).
- No asset step touches an asset whose id is not `sample-deal-*`, `sample-jv-*` or `sample-sma-*`. The exceptions are finding 4 (GP agreements) and finding 5 (GP partner list), which are firm-wide.
- `save_records` (supabase/release_1_1_15.sql) refuses a stale or blind write; conflicts are merged field by field; deletes are soft and restorable.
- Nothing is written before sign-in (guarded setters; the save needs a session and a linked firm).

## What the load adds that no browser test checks on saved data
The legacy-mode test (`sampleSync.e2e.cjs`) starts from a firm with no version; the record-mode test (`sampleSyncRecords.e2e.cjs`) starts from version 2 with assets made by `buildSampleFund`, which already holds the 1.1.17, 1.1.21, 1.1.29 and 1.1.30 data. So in record mode (how your firm's data is stored) those checks pass even if the load adds nothing.
- Tenant credit: only "at least 5 assets have some credit" (legacy). Not checked: the records and flags themselves, prospect screenings, the security deposit added for a tenant in arrears, Model Fund I's aged receivables (`delinquency`).
- Version 3: the appraisal source and appraiser on the two marks (both fixtures have no marks); the unit fields each sample lease adds (start date, deposit, recoveries).
- Version 6 / 7: the repair branch (`fromVersion === 6`).
- Version 8: the changed figures (`withSampleTermChanges`); no fixture holds an earlier sample value, so the old-to-new path never runs in a browser. Market report and rent survey research (the legacy firm has no market data or rent comps; the record fixture already has the items).
- Versions 12, 13, 14, 15 on joint venture and separate account assets and portfolios that already exist (building facts, the move-out, plans, leasing, credit story, Property Management rows, setup terms, capital projects and unit mix). Both fixtures have none, so they are always created whole; the upgrade branch (`page.jsx:1632`, `withSampleSetupTerms` at `:1724`) is what a firm at version 11 to 14 runs.
- Version 15 on Model Fund I: only two capital jobs on Airport Flex Park are checked; not that the TI jobs, invoices and notes already there are kept.
- Record mode only: GP partners and agreements switched on, tenant insurance, the 1.1.27 to 1.1.29 additions, marks, a second open adding nothing.
- Never tested in either: something the user entered on an asset, a fund term or the GP partner list surviving the load (only two documents and a lease are); an edit made during the uploads; a failed upload followed by the next open; a start from version 14.

## Not reviewed
- Components other than `TiSpend.jsx` and the rent roll part of `Documents.jsx` (in particular, in-place changes to data on screen elsewhere).
- `lib/leaseApply.js` beyond `applyAbstract`, `lib/dispositionApply.js`, the aged receivables and Yardi rent roll imports, `lib/revert.js` (restore as of a date).
- The old one-JSON save path (`save_workspace`) beyond what is noted.
- The document tables' own rules (`deal_documents`, `leases`) and file storage.
- Nothing was run in a browser; the browser tests were read, not run.
