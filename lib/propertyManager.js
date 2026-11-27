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
// The fund's terms say who the property management fee is paid to (the
// sponsor or a third party); the asset says who manages it. They should
// agree. Returns "" or the sentence to show.
export function pmFeeMismatch(inputs, terms) {
  if (!inputs?.propertyManagementFirm) return "";
  const firm = pmFirmOf(inputs).type;
  const fee = terms?.feeToPm === "third" ? "third" : "sponsor";
  if (firm === fee) return "";
  return firm === "third"
    ? "A third-party servicer manages this asset, but the fund's terms pay the property management fee to the sponsor."
    : "This firm manages this asset, but the fund's terms pay the property management fee to a third party.";
}
