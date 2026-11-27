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
