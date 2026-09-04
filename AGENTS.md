# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

The WebMCP layer must remain a shared human-agent workspace, not an embedded chatbot. Keep deterministic spatial evidence separate from model reasoning, stage changes outside the canonical playbook, require visible coach review before commit, and route both UI and site-tool edits through the typed editor command boundary.

The New Play flow must offer a Blank Concept path alongside the seeded concepts. A blank concept starts from a named formation and personnel package with all 11 offensive and 11 scout-defense players already positioned, but with no assignments.
