// 1.1.20: a fixed "today" for the browser tests. The sample fund and its
// documents are dated as of 2026-11-27; with the real clock, a suite that
// passes today can fail next month when a sample lease expires or a quarter
// turns. tests/run-e2e.cjs loads this file before each suite (node -r), with
// E2E_TODAY (default 2026-11-27).
//
// The clock is moved, not stopped: the date starts at E2E_TODAY (keeping the
// real time of day) and time passes normally, so timers, waits and autosave
// behave as they do for a user. The same shift is applied in Node (the
// suite's own `new Date()`) and in every page the suite opens.
const TODAY = process.env.E2E_TODAY || "2026-11-27";
const RealDate = Date;
const realNow = RealDate.now();
const startOfRealDay = RealDate.UTC(new RealDate(realNow).getUTCFullYear(), new RealDate(realNow).getUTCMonth(), new RealDate(realNow).getUTCDate());
const OFFSET = RealDate.parse(`${TODAY}T00:00:00Z`) - startOfRealDay; // whole days

// Runs in Node and, as text, in the browser: a Date whose "now" is shifted.
function shiftDate(offset) {
  const Real = Date;
  if (!offset || Real.__shifted) return;
  class Shifted extends Real {
    constructor(...args) { if (args.length === 0) super(Real.now() + offset); else super(...args); }
    static now() { return Real.now() + offset; }
  }
  Shifted.__shifted = true;
  globalThis.Date = Shifted;
}
shiftDate(OFFSET);

// Every browser context a suite opens gets the same shift.
const { chromium } = require("playwright");
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const ctx = await newContext(...a);
    if (OFFSET) await ctx.addInitScript(`(${shiftDate.toString()})(${OFFSET});`);
    return ctx;
  };
  return browser;
};
module.exports = { TODAY, OFFSET };
