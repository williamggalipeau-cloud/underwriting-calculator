<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Every release and patch (user, 11/26)

Each release or patch (version bump) updates, in the same pull request:
- `docs/DEAL_DOCUMENTS_PLAN.md`: "Where we left off" (what's live, what's next), the release's row in the Releases table, and what was decided and built.
- `docs/USER_MANUAL.md`: the version line, the tab and calculation sections the change touches, the "What's in x.y.z" notes and the §13 roadmap row.
- `docs/USER_MANUAL.md` §3 (user, 11/27: "the user manual has to be accurate after every update"): the connector table with its "Tools called" column, the skills table and the agents list. Before each release, count what was actually called in the session record (the `tool_use` entries in `~/.claude/projects/*/*.jsonl`: `mcp__*` tools, `Skill` and `Agent` calls) and make §3 match it: add what is missing, remove or correct what the record does not support, and note any change made to the live database at the user's request. Never describe a tool as used on the strength of memory.
- `README.md` and `lib/version.js` / `package.json` when they change.

Keep the design principles at the top of the plan doc in mind for every new feature.

# Everything ties out (user, 11/27: CRITICAL)

All data and all functions in the app must tie.
- Every piece of sample data, test data and every sample document is written from what is in the application (the sample fund and its assets), never with separate made-up figures.
- The same figure agrees everywhere it appears: asset to fund to firm, screens to reports to exports.
- A tie-out test runs with every test run and fails on any difference. A release that adds sample material or a new figure extends that test in the same pull request.

# No manual loading (user, 11/27)

Sample material loads by itself (the automatic load in `app/page.jsx`, `SAMPLE_DATA_VERSION` in `lib/samplePortfolio.js`). A release that adds sample material raises the version and adds the step. Never ask the user to click to load data.

# Working rules (user, across sessions)

- **Check before claiming.** Nothing is reported as done or correct until a test or a read of the live data confirms it.
- **Plain English** in everything written to the user. Say "your firm's data", not "workspace". Label figures as live data or test copy.
- **Data and security.** Fictional sample data only. Never commit the user's firm data, any key, or the Google API key. Never use the Supabase service_role key. Database changes go in `supabase/*.sql` for the user to run. Live data is read-only unless the user asks for a change.
- **Releases.** A mockup before bigger features. Tests, manual and plan updated in the same pull request. No merge without the user's OK and green tests; merge commit, then the release link.
