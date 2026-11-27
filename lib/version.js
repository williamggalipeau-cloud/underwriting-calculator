// Releases (user, 11/25). The live site runs one release; each is tagged in
// GitHub (v1.0.0, …) with a GitHub Release, so an earlier one can be
// redeployed to revert. See docs/DEAL_DOCUMENTS_PLAN.md → Releases.
export const APP_VERSION = "1.1.22";
export const RELEASE_DATE = "2026-11-26";
export const versionLabel = (v = APP_VERSION) => `v${v.replace(/\.0$/, "")}`; // "v1.0", "v1.0.1"
