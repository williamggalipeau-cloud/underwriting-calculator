// ─── Asset locations for Model Fund I ────────────────────────────────────────
// Fictional street addresses in real cities, matching the sample leases in
// docs/sample-leases. Deals saved without a location get theirs on load.

export const ASSET_LOCATIONS = {
  "Light Industrial (30k SF)":      { address: "1450 Cedar Grove Court",          city: "Ontario",        state: "CA", zip: "91761" },
  "Airport Flex Park":              { address: "6230 Runway Vista Drive",         city: "Las Vegas",      state: "NV", zip: "89119" },
  "Route 9 Small Bay":              { address: "21800 Valley Freight Way",        city: "Kent",           state: "WA", zip: "98032" },
  "Harbor Light Industrial":        { address: "2715 Pier Junction Avenue",       city: "Long Beach",     state: "CA", zip: "90810" },
  "Ridgeway Trade Center":          { address: "9400 Ridgeway Commerce Blvd",     city: "Fort Worth",     state: "TX", zip: "76177" },
  "Canal Street Workshops":         { address: "3120 Canal Street",               city: "Houston",        state: "TX", zip: "77003" },
  "Mill Creek Business Park":       { address: "11500 Mill Creek Loop",           city: "Everett",        state: "WA", zip: "98204" },
  "Southpoint Flex":                { address: "855 Southpoint Parkway",          city: "Henderson",      state: "NV", zip: "89074" },
  "Granite Ave Industrial":         { address: "15020 Granite Avenue",            city: "Fontana",        state: "CA", zip: "92335" },
  "Lakeshore Service Center":       { address: "7300 Lakeshore Service Road",     city: "Dallas",         state: "TX", zip: "75228" },
  "Small Bay Industrial — Phase I": { address: "1900 Greenbelt Industrial Way",   city: "Sparks",         state: "NV", zip: "89431" },
  "Eastside Distribution Hub":      { address: "4400 East Trent Logistics Drive", city: "Spokane Valley", state: "WA", zip: "99216" },
  "Northgate Flex Center":          { address: "12650 Northgate Tech Circle",     city: "Austin",         state: "TX", zip: "78758" },
  "Riverside Commerce Park":        { address: "6800 Arlington Commerce Park",    city: "Riverside",      state: "CA", zip: "92503" },
};

export const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

// Fills a deal's location from the table when it has none.
export function withLocation(inputs) {
  const loc = ASSET_LOCATIONS[inputs?.propertyName];
  if (!loc || inputs.state || inputs.city || inputs.address) return inputs;
  return { ...inputs, ...loc };
}

export const locationLabel = (i) => [i?.city, i?.state].filter(Boolean).join(", ");
