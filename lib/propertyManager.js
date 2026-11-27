// Property manager of an asset (1.1.13, user 11/27): the person and their
// firm, set in asset setup (the Property section of the asset inputs) and
// shown read-only everywhere else.
//   inputs.propertyManager          the person's name
//   inputs.propertyManagementFirm   { type: "sponsor" | "third", name }
//     sponsor = this firm; third = a third-party servicer, with its name.
export const PM_FIRM_TYPES = [["sponsor", "This firm (sponsor)"], ["third", "Third-party servicer"]];
export const pmFirmOf = (inputs) => {
  const f = inputs?.propertyManagementFirm ?? {};
  const type = f.type === "third" ? "third" : "sponsor";
  return { type, name: type === "third" ? String(f.name ?? "").trim() : "" };
};
export const pmFirmLabel = (inputs) => { const f = pmFirmOf(inputs); return f.type === "third" ? f.name || "Third-party servicer" : "This firm (sponsor)"; };
// "Jamie Rivera, This firm (sponsor)"; "" when nothing has been entered.
export function propertyManagerLabel(inputs) {
  const name = String(inputs?.propertyManager ?? "").trim();
  if (!name && !inputs?.propertyManagementFirm) return "";
  return [name, pmFirmLabel(inputs)].filter(Boolean).join(", ");
}
// 1.1.19 (user, 11/27): the property management fee is paid asset by asset.
// An asset whose manager's firm is set here is paid accordingly (this firm,
// or the servicer); an asset with no firm set follows the portfolio's terms.
// Returns the sentence shown under the firm in asset setup.
export function pmFeeNote(inputs, terms) {
  const set = inputs?.propertyManagementFirm && typeof inputs.propertyManagementFirm === "object";
  const third = set ? pmFirmOf(inputs).type === "third" : terms?.feeToPm === "third";
  const who = third ? (set ? pmFirmOf(inputs).name : String(terms?.pmThirdParty ?? "").trim()) || "the third-party servicer" : "this firm";
  return `This asset's property management fee is paid to ${who}${set ? "" : " (the portfolio's terms; set the firm here to decide it for this asset)"}.${third ? " It is not counted in this firm's fee income." : ""}`;
}
// Before 1.1.19 the fee followed the portfolio's terms alone, and an asset
// that disagreed was flagged. The asset now decides, so nothing can disagree.
export const pmFeeMismatch = () => "";
