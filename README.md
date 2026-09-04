# Fieldcraft

Fieldcraft is a desktop-first American football play designer and WebMCP coaching workspace. Coaches can build, time, animate, and export plays without AI. In a compatible browser, ChatGPT or Codex can inspect the exact live play, surface deterministic spatial risks, focus the evidence on the field, and stage a playable Before/After repair for the coach to approve.

There is no embedded chatbot, model API, backend, or account system. The browser agent provides tactical reasoning; the site provides structured football state, geometry, validation, previews, and safe editor actions.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL at 768 px or wider. Below 1100 px, Fieldcraft preserves the tactical field and stacks the timeline and inspector into a compact review deck. It starts on **Pistol Counter** with guard **#66** selected at the **HANDOFF** phase. In a browser with WebMCP enabled, the header reports `SITE TOOLS · 7 READY`.

## Architecture

- React 19, Vite 6, TypeScript, Zustand, Motion, and interactive SVG
- Football coordinates stay in `40 × 53.3` yards; pixel conversion happens only in the renderer
- Playback, trail dots, and analysis all use the same path interpolation
- The deterministic coach engine samples every `0.05s`
- Every human and agent edit crosses the typed editor-command boundary
- Proposals are session-only immutable previews; the playbook changes only on one atomic commit
- Canonical schema remains version 1 and autosaves locally

## Spatial analysis

The engine detects runner/defender threat windows, blocker arrival timing, rush/blitz pressure, sustained route congestion, uncovered route terminals, and assignments that outlive the play. Unassigned defenders hold their starting landmark. Findings are always labeled as spatial/timing risks, never outcome predictions.

Pistol Counter includes a minimal scout-defense timing adjustment for **#52** so the demonstration reliably exposes an early play-side fit before the puller arrives.

## Site tools

| Tool | Purpose |
| --- | --- |
| `get_playbook` | List plays, revisions, selection, and proposal status |
| `get_play` | Read a bounded summary, players page, or assignments page |
| `analyze_play` | Rank up to eight run, pass, protection, or all findings |
| `focus_finding` | Scrub to the evidence and show the involved players on-field |
| `stage_play_changes` | Validate up to 12 operations and open a reversible review |
| `commit_play_changes` | Apply the confirmed proposal once as one undoable command |
| `discard_play_changes` | Close review without changing the saved playbook |

Read outputs are deliberately bounded and marked as untrusted playbook content. `commit_play_changes` explicitly requires prior coach confirmation. Variation mode always creates a renamed duplicate and preserves the original.

### Imperative WebMCP registration

Fieldcraft registers its seven tools once from the top-level page with the browser's imperative WebMCP API. Each complete tool object includes a narrow JSON schema and an `execute` function; the production implementation is in [`src/webmcp/fieldcraftTools.ts`](src/webmcp/fieldcraftTools.ts).

```ts
const controller = new AbortController();

document.modelContext.registerTool({
  name: "analyze_play",
  description: "Run deterministic spatial and timing checks for the current play.",
  inputSchema: {
    type: "object",
    properties: { playId: { type: "string" } },
    required: ["playId"],
    additionalProperties: false,
  },
  execute: async ({ playId }) => analyzePlay(getPlay(playId)),
}, { signal: controller.signal });
```

The app uses an `AbortController` to clean up registrations during hot reloads or page teardown.

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run test:sites
```

Tests cover deterministic geometry, landmark assumptions, findings, strict proposal validation, stale revisions, preview immutability, atomic commit/undo, variations, bounded outputs, all seven registrations, annotations, cleanup, and direct tool execution.

## Try the WebMCP workflow

1. Open **Pistol Counter** and play through the multi-color routes and dot-trail timeline.
2. Ask: “Audit Pistol Counter for what can kill it to the right. Show me the worst moment but don’t change the play.” The agent analyzes, focuses **#52**, and the field scrubs to the danger window.
3. Ask: “Show me a fix.” The agent stages a puller adjustment. Toggle **Before / After** and play both versions; the saved play is still untouched.
4. Ask: “Yes, apply it.” The agent commits exactly once. Undo shows that the whole repair is one editor action.
5. Ask: “Create a variation with a different backside route.” Review and apply the renamed variation; the original remains unchanged.

The bundled turf and fonts have no runtime dependency on an external image or font service.

## License

MIT — see [LICENSE](LICENSE).
