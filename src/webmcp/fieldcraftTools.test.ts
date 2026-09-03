import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInitialPlaybook } from "../data/templates";
import { useEditorStore } from "../store/editorStore";
import { createFieldcraftTools, registerFieldcraftTools } from "./fieldcraftTools";

const resetStore = () => useEditorStore.setState({
  playbook: makeInitialPlaybook(),
  selectedPlayerIds: ["o-rg"],
  selectedAssignmentId: "a-rg",
  currentTime: 1.4,
  isPlaying: false,
  history: [],
  future: [],
  agentProposal: null,
  agentFocus: null,
  proposalView: "after",
  webMcpStatus: "unsupported",
  toast: null,
});

describe("Fieldcraft WebMCP tools", () => {
  beforeEach(resetStore);

  it("registers all seven tools with schemas, annotations, and abort cleanup", async () => {
    const registrations: Array<{ tool: WebMCP.ModelContextTool; signal?: AbortSignal }> = [];
    const registerTool = vi.fn(async (tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
      registrations.push({ tool, signal: options?.signal });
    });
    const cleanup = registerFieldcraftTools({ registerTool } as unknown as WebMCP.ModelContext);
    await Promise.resolve();
    await Promise.resolve();
    expect(registrations.map((item) => item.tool.name)).toEqual([
      "get_playbook",
      "get_play",
      "analyze_play",
      "focus_finding",
      "stage_play_changes",
      "commit_play_changes",
      "discard_play_changes",
    ]);
    expect(registrations.every((item) => item.tool.inputSchema && item.tool.annotations)).toBe(true);
    expect(registrations.find((item) => item.tool.name === "get_playbook")?.tool.annotations?.readOnlyHint).toBe(true);
    expect(registrations.find((item) => item.tool.name === "commit_play_changes")?.tool.description).toMatch(/explicitly confirms/);
    cleanup();
    expect(registrations.every((item) => item.signal?.aborted)).toBe(true);
  });

  it("keeps read outputs bounded and stages without changing canonical play data", async () => {
    const tools = new Map(createFieldcraftTools().map((tool) => [tool.name, tool]));
    const play = useEditorStore.getState().playbook.plays.find((item) => item.id === "pistol-counter")!;
    const analyze = await tools.get("analyze_play")!.execute({ playId: play.id, focus: "all", limit: 8 }, { signal: new AbortController().signal });
    expect(JSON.stringify(analyze).length).toBeLessThanOrEqual(1500);
    const before = structuredClone(play);
    const staged = await tools.get("stage_play_changes")!.execute({
      basePlayId: play.id,
      baseUpdatedAt: play.updatedAt,
      mode: "variation",
      name: "Pistol Counter Backside Post",
      rationale: "Replace the backside clear with a post to change the safety conflict.",
      changes: [{ type: "apply_preset", playerId: "o-wr-l", preset: "post", kind: "route", color: "coral" }],
    }, { signal: new AbortController().signal }) as { proposalId: string };
    expect(useEditorStore.getState().playbook.plays.find((item) => item.id === play.id)).toEqual(before);
    expect(staged.proposalId).toBeTruthy();
  });

  it("rejects invalid staging without corrupting the active state", async () => {
    const stage = createFieldcraftTools().find((tool) => tool.name === "stage_play_changes")!;
    const playbook = structuredClone(useEditorStore.getState().playbook);
    await expect(stage.execute({
      basePlayId: "pistol-counter",
      baseUpdatedAt: "stale",
      mode: "edit",
      rationale: "Bad request",
      changes: [{ type: "move_player", playerId: "missing", to: { x: 2, y: 2 } }],
    }, { signal: new AbortController().signal })).rejects.toThrow();
    expect(useEditorStore.getState().playbook).toEqual(playbook);
    expect(useEditorStore.getState().agentProposal).toBeNull();
  });
});

