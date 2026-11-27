"""Rebuilds the Model Fund I sample leases and their abstracts from the fund
(1.1.13: everything ties out). Run after scripts/sample-deal-docs/export_fund.cjs:

  python3 scripts/sample-leases/generate.py      # HTML + index.json (all leases)
  node scripts/sample-leases/pdf.cjs             # PDFs
  python3 scripts/sample-leases/build_fund.py    # abstracts for the nine fund leases

Each abstract is built from the lease's own text by abstract_all.py (every
quote is checked to be on its page of the PDF) and saved as a sample abstract:
made_with "Sample (fictional)", validated false. It is NOT sent to the
CREparser connector. The tenant's business and SIC code are the rent roll
unit's (the lease's Permitted Use states that business).
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import abstract_all as AA  # noqa: E402
from leases import _FUND_LEASES  # noqa: E402

OUT = ROOT / "docs" / "sample-leases"
tmp = Path(tempfile.mkdtemp())
for L in _FUND_LEASES:
    stems = [L["file"]] + ([L["amendment"]["file"]] if L.get("amendment") else [])
    for s in stems:
        subprocess.run(["pdftotext", "-layout", str(OUT / f"{s}.pdf"), str(tmp / f"{s}.txt")], check=True)
    lease, app = AA.build(AA.Lease(stems, tmp), stems)
    u = L["fund_unit"]
    for f in lease["fields"]:
        if f["key"] == "tenant_business":
            assert f["value"].lower() == u["business"].lower(), (f["value"], u["business"])
            f["value"] = u["business"]
        if f["key"] == "sic_code":
            f["value"] = u["sic"]
            f["calculation"] = f"Business: {u['business']} → SIC {u['sic']} (the rent roll's code for this tenant)"
    app.update({"tenant_business": u["business"], "sic_code": u["sic"], "made_with": "Sample (fictional)", "validated": False})
    (OUT / "abstracts" / f"{stems[0]}.json").write_text(json.dumps({**lease, "app": app}, ensure_ascii=False, separators=(",", ":")))
    print(stems[0], len(lease["fields"]), "fields", len(lease["rent_schedule"]), "rent rows", "+ amendment" if len(stems) > 1 else "")
