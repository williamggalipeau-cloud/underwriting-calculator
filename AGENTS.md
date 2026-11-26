<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Every release and patch (user, 11/26)

Each release or patch (version bump) updates, in the same pull request:
- `docs/DEAL_DOCUMENTS_PLAN.md`: "Where we left off" (what's live, what's next), the release's row in the Releases table, and what was decided and built.
- `docs/USER_MANUAL.md`: the version line, the tab and calculation sections the change touches, the "What's in x.y.z" notes and the §13 roadmap row.
- `README.md` and `lib/version.js` / `package.json` when they change.

Keep the design principles at the top of the plan doc in mind for every new feature.
