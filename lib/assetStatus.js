// 1.1.26: whether an asset has been sold. A whole-asset sale that has closed
// sets inputs.realizedSaleDate (lib/dispositions.js closeSale). Until 1.1.26
// no sample asset had been sold, and the screens that list what the firm
// operates today (the Dashboard, Tenant Credit, the risk report, SNDAs, the
// fund limits, Vacant Units) kept listing a sold asset as owned. They now
// leave it out from its sale date. The return screens (Portfolio Return, the
// Track Record, GP and Firm Economics, valuations up to the sale) keep it.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const saleDateOf = (inputs) => (ISO.test(inputs?.realizedSaleDate ?? "") ? inputs.realizedSaleDate : "");
export const isSold = (inputs, todayISO) => { const d = saleDateOf(inputs); return !!d && d <= todayISO; };
// The deals still owned on a date (not yet sold).
export const notSold = (deals, todayISO) => (deals ?? []).filter((d) => !isSold(d.inputs, todayISO));
