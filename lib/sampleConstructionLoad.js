// 1.1.30: the sample capital jobs added to the sample construction file
// (docs/sample-yardi), onto a Model Fund I asset as it is now: only the capital
// jobs the asset does not hold yet, so jobs and notes already there are kept.
import { importConstruction, isTI, parseInvoices, parseJobs } from "@/lib/construction";
import { parseCSV } from "@/lib/fundTerms";
import { SAMPLE_CONSTRUCTION_AS_OF, SAMPLE_CONSTRUCTION_INVOICES_CSV, SAMPLE_CONSTRUCTION_JOBS_CSV } from "@/lib/sampleConstruction";

let parsed = null;
export function withSampleCapitalJobs(inputs, dealId) {
  if (!/^sample-deal-\d+$/.test(dealId ?? "") || !inputs) return inputs;
  parsed ??= { jobs: parseJobs(parseCSV(SAMPLE_CONSTRUCTION_JOBS_CSV)), invoices: parseInvoices(parseCSV(SAMPLE_CONSTRUCTION_INVOICES_CSV)) };
  const have = new Set((inputs.construction?.jobs ?? []).map((j) => j.code));
  const jobs = parsed.jobs.filter((j) => !isTI(j) && !have.has(j.code));
  if (!jobs.length) return inputs;
  const r = importConstruction([{ id: dealId, inputs }], { jobs, invoices: parsed.invoices.filter((i) => jobs.some((j) => j.code === i.code)), asOf: inputs.construction?.asOf || SAMPLE_CONSTRUCTION_AS_OF, source: "sample" });
  return r.updates[dealId] ? { ...inputs, construction: r.updates[dealId] } : inputs;
}
