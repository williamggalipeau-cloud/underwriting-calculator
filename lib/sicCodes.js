// ─── SIC codes for tenants ───────────────────────────────────────────────────
// Standard Industrial Classification (SIC, 1987) codes most often seen in
// light industrial, flex and small bay tenants, a matcher that suggests a code
// from a tenant's business description, and fictional sample businesses for
// generated rent rolls.

export const SIC_CODES = [
  ["0782", "Lawn & garden services"],
  ["1521", "General contractors — single-family houses"],
  ["1542", "General contractors — nonresidential buildings"],
  ["1711", "Plumbing, heating & air-conditioning contractors"],
  ["1721", "Painting & paper hanging"],
  ["1731", "Electrical work"],
  ["1741", "Masonry, stone setting & other stone work"],
  ["1751", "Carpentry work"],
  ["1752", "Floor laying & other floor work"],
  ["1761", "Roofing, siding & sheet metal work"],
  ["1793", "Glass & glazing work"],
  ["1799", "Special trade contractors, NEC"],
  ["2051", "Bread & other bakery products"],
  ["2082", "Malt beverages (breweries)"],
  ["2086", "Bottled & canned soft drinks"],
  ["2095", "Roasted coffee"],
  ["2099", "Food preparations, NEC"],
  ["2389", "Apparel & accessories, NEC"],
  ["2434", "Wood kitchen cabinets"],
  ["2499", "Wood products, NEC"],
  ["2511", "Wood household furniture"],
  ["2752", "Commercial printing, lithographic"],
  ["3089", "Plastics products, NEC"],
  ["3272", "Concrete products"],
  ["3281", "Cut stone & stone products"],
  ["3441", "Fabricated structural metal"],
  ["3443", "Fabricated plate work (boiler shops)"],
  ["3444", "Sheet metal work"],
  ["3499", "Fabricated metal products, NEC"],
  ["3544", "Special dies, tools, jigs & fixtures"],
  ["3569", "General industrial machinery, NEC (incl. robots)"],
  ["3585", "Air-conditioning & heating equipment"],
  ["3599", "Industrial machinery, NEC (machine shops)"],
  ["3672", "Printed circuit boards"],
  ["3679", "Electronic components, NEC"],
  ["3714", "Motor vehicle parts & accessories"],
  ["3728", "Aircraft parts & auxiliary equipment"],
  ["3732", "Boat building & repairing"],
  ["3842", "Orthopedic, prosthetic & surgical appliances"],
  ["3949", "Sporting & athletic goods, NEC"],
  ["3993", "Signs & advertising specialties"],
  ["3999", "Manufacturing industries, NEC"],
  ["4212", "Local trucking without storage"],
  ["4213", "Trucking, except local"],
  ["4214", "Local trucking with storage"],
  ["4215", "Courier services, except by air"],
  ["4222", "Refrigerated warehousing & storage"],
  ["4225", "General warehousing & storage"],
  ["4226", "Special warehousing & storage, NEC"],
  ["4731", "Freight & cargo transportation arrangement"],
  ["5013", "Motor vehicle supplies & new parts (wholesale)"],
  ["5021", "Furniture (wholesale)"],
  ["5031", "Lumber, plywood & millwork (wholesale)"],
  ["5039", "Construction materials, NEC (wholesale)"],
  ["5045", "Computers & software (wholesale)"],
  ["5047", "Medical, dental & hospital equipment (wholesale)"],
  ["5063", "Electrical apparatus & wiring supplies (wholesale)"],
  ["5065", "Electronic parts & equipment (wholesale)"],
  ["5072", "Hardware (wholesale)"],
  ["5074", "Plumbing & heating equipment (wholesale)"],
  ["5075", "Warm air heating & air-conditioning equipment (wholesale)"],
  ["5078", "Refrigeration equipment (wholesale)"],
  ["5084", "Industrial machinery & equipment (wholesale)"],
  ["5085", "Industrial supplies (wholesale)"],
  ["5088", "Transportation equipment & supplies (wholesale)"],
  ["5091", "Sporting & recreational goods (wholesale)"],
  ["5099", "Durable goods, NEC (wholesale)"],
  ["5141", "Groceries, general line (wholesale)"],
  ["5149", "Groceries & related products, NEC (wholesale)"],
  ["5169", "Chemicals & allied products (wholesale)"],
  ["5181", "Beer & ale (wholesale)"],
  ["5199", "Nondurable goods, NEC (wholesale)"],
  ["5211", "Lumber & building materials dealers"],
  ["5531", "Auto & home supply stores"],
  ["5961", "Catalog & mail-order houses (e-commerce)"],
  ["7342", "Disinfecting & pest control services"],
  ["7349", "Building cleaning & maintenance services"],
  ["7359", "Equipment rental & leasing, NEC"],
  ["7382", "Security systems services"],
  ["7389", "Business services, NEC"],
  ["7532", "Auto body, paint & upholstery shops"],
  ["7538", "General automotive repair shops"],
  ["7549", "Automotive services, NEC"],
  ["7623", "Refrigeration & air-conditioning repair"],
  ["7629", "Electrical & electronic repair shops, NEC"],
  ["7641", "Reupholstery & furniture repair"],
  ["7692", "Welding repair"],
  ["7699", "Repair shops & related services, NEC"],
  ["7812", "Motion picture & video production"],
  ["7991", "Physical fitness facilities"],
  ["8711", "Engineering services"],
  ["8731", "Commercial physical & biological research"],
];

const TITLES = new Map(SIC_CODES);
export const sicTitle = (code) => TITLES.get(String(code ?? "").trim()) ?? "";
export const sicLabel = (code) => {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const t = sicTitle(c);
  return t ? `${c} — ${t}` : c;
};

// Business description → SIC. Rules run in order; the first match wins, so
// specific phrases come before general ones.
const RULES = [
  [/brew(ing)? equipment|stainless|tank fab|boiler|plate work/, "3443"],
  [/brewer|brewing|craft beer|distill/, "2082"],
  [/beverage|soda|kombucha|bottling/, "2086"],
  [/coffee roast/, "2095"],
  [/bakery|baked goods/, "2051"],
  [/grocer/, "5141"],
  [/food (prep|production|manufactur)|commissary|catering|meal prep/, "2099"],
  [/food|produce|specialty food/, "5149"],
  [/cabinet|millwork/, "2434"],
  [/furniture (repair|upholster)|upholster/, "7641"],
  [/furniture (wholesale|distribut)/, "5021"],
  [/furniture/, "2511"],
  [/sign|graphic|wrap/, "3993"],
  [/print/, "2752"],
  [/aircraft|avionic|aerospace|aviation/, "3728"],
  [/robot|automation/, "3569"],
  [/cnc|machine shop|machining|precision (mfg|manufactur|parts)/, "3599"],
  [/tool (&|and) die|die cast|tooling|jigs?|fixtures/, "3544"],
  [/sheet metal/, "3444"],
  [/structural/, "3441"],
  [/weld/, "7692"],
  [/metal|fabricat/, "3499"],
  [/circuit board|pcb/, "3672"],
  [/electronic.*(assembly|components|manufactur)/, "3679"],
  [/electronic.*(wholesale|distribut|parts)/, "5065"],
  [/marine electric|electronic.*repair|electrical repair/, "7629"],
  [/boat|marine/, "3732"],
  [/solar/, "1731"],
  [/refrigeration (equipment|supply|wholesale)/, "5078"],
  [/refrigeration|appliance repair/, "7623"],
  [/(hvac|heating|air.?condition).*(wholesale|supply|distribut|parts)|(wholesale|supply|distribut).*(hvac|heating|air.?condition)/, "5075"],
  [/hvac|heating|air.?condition|mechanical contractor/, "1711"],
  [/plumbing.*(supply|wholesale|distribut)/, "5074"],
  [/plumb/, "1711"],
  [/electrical.*(supply|wholesale|distribut|parts)/, "5063"],
  [/electric/, "1731"],
  [/auto(motive)? parts|vehicle parts.*(wholesale|distribut)|parts distributor/, "5013"],
  [/body (shop|work)|collision|auto paint/, "7532"],
  [/fleet|auto(motive)? repair|vehicle (maintenance|repair)|mechanic/, "7538"],
  [/detailing|car wash|window tint/, "7549"],
  [/vehicle parts|auto(motive)? (mfg|manufactur)/, "3714"],
  [/courier|same.?day/, "4215"],
  [/last.?mile|moving|delivery (&|and) storage/, "4214"],
  [/freight forward|customs|3pl broker|freight broker/, "4731"],
  [/trucking|freight/, "4213"],
  [/cold storage|refrigerated (warehous|storage)/, "4222"],
  [/fulfillment|warehous|logistics|storage|distribution center/, "4225"],
  [/e.?commerce|online retail|mail.?order/, "5961"],
  [/security|alarm/, "7382"],
  [/medical|dental|surgical/, "5047"],
  [/orthotic|prosthetic/, "3842"],
  [/laborator|research|r ?& ?d|biotech/, "8731"],
  [/engineering/, "8711"],
  [/fitness|gym|crossfit|training studio/, "7991"],
  [/janitorial|cleaning/, "7349"],
  [/pest/, "7342"],
  [/landscap|lawn|garden/, "0782"],
  [/equipment rental|rental/, "7359"],
  [/roof/, "1761"],
  [/floor/, "1752"],
  [/glass|glazing/, "1793"],
  [/paint/, "1721"],
  [/masonry|stone|countertop|granite|tile/, "3281"],
  [/concrete/, "3272"],
  [/carpentry|framing/, "1751"],
  [/general contractor|construction|builder|remodel/, "1542"],
  [/contractor/, "1799"],
  [/plastic/, "3089"],
  [/apparel|garment|sewing/, "2389"],
  [/sporting|athletic|outdoor gear/, "3949"],
  [/lumber|building material/, "5211"],
  [/hardware/, "5072"],
  [/industrial supply|industrial supplies|fasteners|mro/, "5085"],
  [/machinery|equipment (wholesale|distribut|dealer)/, "5084"],
  [/chemical/, "5169"],
  [/computer|software|it equipment/, "5045"],
  [/beer|wine|spirits/, "5181"],
  [/video|film|studio/, "7812"],
  [/repair|service/, "7699"],
  [/import|wholesale|distribut/, "5099"],
  [/manufactur|assembly|mfg|production/, "3999"],
];

// Suggested SIC code for a business description (or permitted use), or "".
export function suggestSic(text) {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim()) return "";
  for (const [re, code] of RULES) if (re.test(t)) return code;
  return "";
}

// ─── Fictional businesses for generated rent rolls ───────────────────────────
const PREFIXES = [
  "Summit", "Redwood", "Harbor", "Ironwood", "Cascade", "Desert Sky", "Pinnacle", "Blue Mesa",
  "Granite", "Northstar", "Sierra", "Bayline", "Cedar Ridge", "Copper Canyon", "Evergreen", "Lone Pine",
  "Riverbend", "Sagebrush", "Westgate", "Prairie",
];
const BUSINESSES = [
  ["Cabinet Works", "Custom cabinetry & millwork", "2434"],
  ["Freight Services", "Local trucking & freight", "4213"],
  ["Sheet Metal", "Sheet metal fabrication", "3444"],
  ["HVAC Supply", "HVAC equipment wholesale", "5075"],
  ["Signs & Graphics", "Commercial signage & vehicle wraps", "3993"],
  ["Auto Repair", "General automotive repair", "7538"],
  ["Precision Machining", "CNC machining & precision parts", "3599"],
  ["Electrical Contractors", "Electrical contractor", "1731"],
  ["Food Distributors", "Specialty food distribution", "5149"],
  ["Fitness Studio", "Strength & conditioning gym", "7991"],
  ["Plumbing Supply", "Plumbing & heating supply wholesale", "5074"],
  ["Fulfillment", "E-commerce fulfillment & storage", "4225"],
  ["Welding & Repair", "Welding repair & custom fabrication", "7692"],
  ["Print Shop", "Commercial printing", "2752"],
  ["Electronics", "Electronics assembly", "3679"],
  ["Landscape Supply", "Landscaping services & yard storage", "0782"],
  ["Roofing", "Roofing contractor", "1761"],
  ["Industrial Supply", "Industrial supplies & fasteners", "5085"],
  ["Coffee Roasters", "Specialty coffee roasting", "2095"],
  ["Security Systems", "Security & alarm installation", "7382"],
  ["Courier", "Same-day courier service", "4215"],
  ["Woodworks", "Furniture & woodworking shop", "2511"],
  ["Equipment Rental", "Construction equipment rental", "7359"],
  ["Collision Center", "Auto body & paint", "7532"],
  ["Medical Supply", "Medical & dental equipment distribution", "5047"],
  ["Tile & Stone", "Countertop fabrication & stone", "3281"],
  ["Pest Control", "Pest control services", "7342"],
  ["Auto Parts", "Auto parts distribution", "5013"],
  ["Brewing Co.", "Craft brewery & taproom", "2082"],
  ["Mechanical", "Plumbing & mechanical contractor", "1711"],
  ["Logistics", "Warehousing & distribution", "4225"],
  ["Tool & Die", "Tooling & die making", "3544"],
  ["Flooring", "Flooring contractor & showroom", "1752"],
  ["Appliance Service", "Refrigeration & appliance repair", "7623"],
  ["Plastics", "Plastic parts molding", "3089"],
  ["Builders", "Commercial general contractor", "1542"],
  ["Outdoor Gear", "Sporting goods wholesale", "5091"],
  ["Lab Services", "Testing & research laboratory", "8731"],
  ["Janitorial", "Commercial cleaning services", "7349"],
  ["Glass & Glazing", "Glass & glazing contractor", "1793"],
];

const GENERIC = /^tenant\s*\d+$/i;
export const isGenericTenant = (name) => GENERIC.test(String(name ?? "").trim());

// A fictional business for the k-th unit of the i-th asset: { tenantName,
// businessDescription, sicCode }. Units in one asset get different businesses.
export function sampleBusiness(i, k) {
  const [noun, business, sic] = BUSINESSES[((i * 7) + k) % BUSINESSES.length];
  const prefix = PREFIXES[((i * 3) + k * 11) % PREFIXES.length];
  return { tenantName: `${prefix} ${noun}`, businessDescription: business, sicCode: sic };
}

// Gives a rent roll SIC codes: occupied units with a generic name ("Tenant
// 001") and no business get a fictional business; units with a business and
// no SIC code get the suggested code. Other units are left as they are.
export function withSicCodes(units, i = 0) {
  let k = 0;
  return (units ?? []).map((u) => {
    if (u.leaseStatus !== "occupied") return u;
    const idx = k++;
    if (!String(u.businessDescription ?? "").trim() && (isGenericTenant(u.tenantName) || !String(u.tenantName ?? "").trim())) {
      return { ...u, ...sampleBusiness(i, idx) };
    }
    if (!String(u.sicCode ?? "").trim()) {
      const code = suggestSic(u.businessDescription);
      return code ? { ...u, sicCode: code } : u;
    }
    return u;
  });
}
