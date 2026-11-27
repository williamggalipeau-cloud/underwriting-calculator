# Test fixtures

`deal-docs/` holds document abstracts that **differ from Model Fund I on
purpose** (an asking price above the purchase price, a cap rated below the
loan's minimum, a tenant certificate short of the lease's requirement…), so
the tests of reading, comparing and applying a document have something to
find. They are the sample abstracts as they were before 1.1.13.

They are test data only. The sample documents the app loads
(`docs/sample-deal-docs`, `public/sample-docs`) are written from Model Fund I
and tie out to it (`tests/node/sampleTieOut.test.cjs`); nothing here is
loaded into the app.

`sample-leases/`, `dispositions/` and `tenant-credit/` are the sample leases,
sale documents and tenant credit files as they were before 1.1.13 (tenants
that are not on Model Fund I's rent rolls, sales with closing statements, a
lease with an expansion amendment…). The tests of abstracting a lease,
applying it to a unit, tenant credit flags, estoppel and CAM checks, and
reading a sale's documents use them for the same reason: they need
documents that differ from the model. `scripts/sample-deal-docs/tenant_credit.cjs`
regenerates `tenant-credit/`.
