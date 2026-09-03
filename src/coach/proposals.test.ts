import { describe, expect, it } from "vitest";
import { PLAY_TEMPLATES } from "../data/templates";
import { buildAgentProposal, isProposalTargetResolved, parseStageInput } from "./proposals";
import { analyzePlay } from "./analysis";

const counter = () => structuredClone(PLAY_TEMPLATES.find((play) => play.id === "pistol-counter")!);

describe("agent proposals", () => {
  it("rejects stale and invalid requests without touching the play", () => {
    const play = counter();
    const snapshot = structuredClone(play);
    expect(() => parseStageInput({
      basePlayId: play.id,
      baseUpdatedAt: "stale",
      mode: "edit",
      rationale: "Test",
      changes: [{ type: "move_player", playerId: "o-rg", to: { x: 99, y: 1 } }],
    }, play)).toThrow(/changed/);
    expect(play).toEqual(snapshot);
  });

  it("builds an immutable preview and resolves a seeded run threat with an early block", () => {
    const play = counter();
    const before = structuredClone(play);
    const target = analyzePlay(play, "run").find(
      (finding) => finding.playerIds.includes("d-olb-r"),
    )!;
    expect(target).toBeTruthy();
    const proposal = buildAgentProposal(play, {
      basePlayId: play.id,
      baseUpdatedAt: play.updatedAt,
      mode: "edit",
      rationale: "Send the puller through the terminal safety landmark before the runner arrives.",
      targetFindingId: target.id,
      changes: [{
        type: "set_assignment",
        playerId: "o-rg",
        kind: "block",
        color: "orange",
        startTime: 0,
        duration: 1.35,
        segments: [
          { type: "curve", control: { x: 20, y: 29 }, to: { x: 23.5, y: 34 } },
          { type: "curve", control: { x: 26, y: 37 }, to: { x: 28.6, y: 35.3 } },
        ],
      }],
    });
    expect(play).toEqual(before);
    expect(proposal.previewPlay).not.toBe(play);
    expect(isProposalTargetResolved(proposal)).toBe(true);
  });

  it("requires a renamed duplicate for variations", () => {
    const play = counter();
    expect(() => buildAgentProposal(play, {
      basePlayId: play.id,
      baseUpdatedAt: play.updatedAt,
      mode: "variation",
      rationale: "Try a new backside route.",
      changes: [{ type: "apply_preset", playerId: "o-wr-l", preset: "post", kind: "route" }],
    })).toThrow(/requires a new name/);
  });
});
