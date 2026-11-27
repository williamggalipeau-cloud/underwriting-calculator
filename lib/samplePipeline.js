// Fictional pipeline deals for demos and testing (user, 11/24), added from the
// owner-only Sample data menu. Fixed ids so adding them twice does nothing.
// Names, addresses, sellers and brokers are made up. Contract dates are set
// from today so they show on the Dashboard's Upcoming Events.
import { makePipelineDeal } from "@/lib/pipeline";

const plus = (today, n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function samplePipelineDeals(today = new Date().toISOString().slice(0, 10), { by = "", targetFund = "Model Fund I" } = {}) {
  return [
    {
      id: "sample-pl-1", name: "Example Crossroads Logistics", address: "1200 Example Crossroads Blvd", city: "Reno", state: "NV", market: "Reno East",
      sf: 48000, askingPrice: 9600000, capRatePct: 6.4, noi: 614000, source: "CoStar (fictional)", seller: "Sample Seller LLC",
      stage: "psa", targetFund, nextStep: "Phase I and PCA reports", nextDate: plus(today, 6),
      psaDate: plus(today, -20), depositDue: plus(today, -17), ddStart: plus(today, -20), ddDeadline: plus(today, 10), hardDate: plus(today, 10), loanClosing: plus(today, 40), expectedClose: plus(today, 45),
      notes: "Fictional sample: under contract, due diligence ends in 10 days.",
    },
    {
      id: "sample-pl-2", name: "Example Canyon Flex", address: "88 Example Canyon Way", city: "Boise", state: "ID", market: "Boise Airport",
      sf: 36000, askingPrice: 6850000, capRatePct: 6.8, noi: 466000, source: "Broker (fictional)", seller: "Placeholder Partners LP",
      stage: "loi", targetFund, nextStep: "Seller response to LOI", nextDate: plus(today, 3), expectedClose: plus(today, 95),
      notes: "Fictional sample: LOI submitted.",
    },
    {
      id: "sample-pl-3", name: "Example Harbor Small Bay", address: "410 Example Harbor Rd", city: "Tacoma", state: "WA", market: "Tacoma Port",
      sf: 29000, askingPrice: 7200000, capRatePct: 5.9, noi: 425000, source: "Off-market (fictional)", seller: "Demo Holdings Inc",
      stage: "screening", targetFund, nextStep: "Underwrite in the Underwriter", nextDate: plus(today, 12), expectedClose: plus(today, 150),
      notes: "Fictional sample: screening.",
    },
  ].map((r) => makePipelineDeal(r, { today, by }));
}
