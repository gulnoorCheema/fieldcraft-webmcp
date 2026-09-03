import { beforeEach, describe, expect, it } from "vitest";
import { makeInitialPlaybook, PLAY_TEMPLATES } from "../data/templates";
import { dispatchEditorCommand, isPlaybookDocument, useEditorStore } from "./editorStore";

const resetStore = () => {
  useEditorStore.setState({
    playbook: makeInitialPlaybook(),
    selectedPlayerIds: ["o-rg"],
    selectedAssignmentId: "a-rg",
    history: [],
    future: [],
    currentTime: 1.4,
    isPlaying: false,
    agentProposal: null,
    agentFocus: null,
    proposalView: "after",
    toast: null,
  });
};

describe("editor command boundary", () => {
  beforeEach(resetStore);

  it("ships eight independent 11-on-11 starter concepts", () => {
    expect(PLAY_TEMPLATES).toHaveLength(8);
    PLAY_TEMPLATES.forEach((play) => {
      expect(play.players.filter((player) => player.team === "offense")).toHaveLength(11);
      expect(play.players.filter((player) => player.team === "defense")).toHaveLength(11);
      expect(new Set(play.assignments.map((assignment) => assignment.playerId)).size).toBe(
        play.assignments.length,
      );
    });
  });

  it("moves players and their assignment through a single undoable command", () => {
    const before = structuredClone(useEditorStore.getState().playbook);
    const play = before.plays.find((item) => item.id === "pistol-counter")!;
    const guard = play.players.find((player) => player.id === "o-rg")!;
    const pathEnd = play.assignments.find((assignment) => assignment.playerId === guard.id)!.segments[0].to;

    dispatchEditorCommand({
      type: "player.move",
      positions: { "o-rg": { x: guard.start.x + 1, y: guard.start.y + 0.5 } },
    });

    const moved = useEditorStore.getState().playbook.plays.find((item) => item.id === "pistol-counter")!;
    expect(moved.players.find((player) => player.id === "o-rg")!.start.x).toBe(guard.start.x + 1);
    expect(moved.assignments.find((assignment) => assignment.playerId === "o-rg")!.segments[0].to.x).toBe(pathEnd.x + 1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().playbook).toEqual(before);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().playbook.plays.find((item) => item.id === "pistol-counter")!.players.find((player) => player.id === "o-rg")!.start.x).toBe(guard.start.x + 1);
  });

  it("duplicates selected players and keeps invalid imports out", () => {
    dispatchEditorCommand({
      type: "players.duplicate",
      playerIds: ["o-rg"],
      offset: { x: 1, y: 1 },
    });
    const selected = useEditorStore.getState().playbook.plays.find((item) => item.id === "pistol-counter")!;
    expect(selected.players).toHaveLength(23);
    expect(selected.assignments.filter((assignment) => assignment.playerId.includes("o-rg-copy"))).toHaveLength(1);
    expect(isPlaybookDocument({ schemaVersion: 2, plays: [] })).toBe(false);
    expect(isPlaybookDocument(makeInitialPlaybook())).toBe(true);
    expect(isPlaybookDocument({ ...makeInitialPlaybook(), selectedPlayId: "missing" })).toBe(false);
  });

  it("creates, duplicates, and deletes plays without affecting the source concept", () => {
    const startingCount = useEditorStore.getState().playbook.plays.length;
    dispatchEditorCommand({ type: "play.createFromTemplate", templateId: "y-stick" });
    const created = useEditorStore.getState().playbook;
    expect(created.plays).toHaveLength(startingCount + 1);
    expect(created.plays.find((play) => play.id === "y-stick")?.name).toBe("Y Stick");

    dispatchEditorCommand({ type: "play.duplicate", playId: created.selectedPlayId });
    const duplicated = useEditorStore.getState().playbook;
    expect(duplicated.plays).toHaveLength(startingCount + 2);
    expect(duplicated.plays.find((play) => play.id === "y-stick")?.name).toBe("Y Stick");

    dispatchEditorCommand({ type: "play.delete", playId: duplicated.selectedPlayId });
    expect(useEditorStore.getState().playbook.plays).toHaveLength(startingCount + 1);
  });

  it("commits a reviewed edit as one atomic undoable command", () => {
    const state = useEditorStore.getState();
    const play = state.playbook.plays.find((item) => item.id === "pistol-counter")!;
    const before = structuredClone(state.playbook);
    const proposal = state.stageAgentProposal({
      basePlayId: play.id,
      baseUpdatedAt: play.updatedAt,
      mode: "edit",
      rationale: "Give the puller more time to reach the right-side landmark.",
      changes: [{ type: "retime_assignment", playerId: "o-rg", duration: 1.55 }],
    });
    expect(useEditorStore.getState().playbook).toEqual(before);
    useEditorStore.getState().commitAgentProposal(proposal.id);
    expect(useEditorStore.getState().history).toHaveLength(1);
    expect(useEditorStore.getState().playbook.plays.find((item) => item.id === play.id)!
      .assignments.find((assignment) => assignment.playerId === "o-rg")?.duration).toBe(1.55);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().playbook).toEqual(before);
  });

  it("commits a variation as a renamed duplicate while leaving the original unchanged", () => {
    const state = useEditorStore.getState();
    const play = state.playbook.plays.find((item) => item.id === "pistol-counter")!;
    const original = structuredClone(play);
    const proposal = state.stageAgentProposal({
      basePlayId: play.id,
      baseUpdatedAt: play.updatedAt,
      mode: "variation",
      name: "Pistol Counter Backside Post",
      rationale: "Change the backside safety conflict.",
      changes: [{ type: "apply_preset", playerId: "o-wr-l", preset: "post", kind: "route", color: "coral" }],
    });
    const committed = useEditorStore.getState().commitAgentProposal(proposal.id);
    expect(committed.name).toBe("Pistol Counter Backside Post");
    expect(committed.id).not.toBe(play.id);
    expect(useEditorStore.getState().playbook.plays.find((item) => item.id === play.id)).toEqual(original);
  });
});
