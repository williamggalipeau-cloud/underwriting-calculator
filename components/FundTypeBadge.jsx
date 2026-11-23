// Fund type tag (label only; the model is the same for every type). 11/23.
import { fundType } from "@/lib/fundTypes";

const TONE = {
  Fund: "bg-blue-50 text-blue-700 border-blue-200",
  "Separate Account": "bg-violet-50 text-violet-700 border-violet-200",
  "Joint Venture": "bg-amber-50 text-amber-800 border-amber-200",
};

export default function FundTypeBadge({ type, className = "" }) {
  const t = fundType(type);
  return (
    <span data-testid="fund-type-badge" className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap ${TONE[t]} ${className}`}>
      {t}
    </span>
  );
}
