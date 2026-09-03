import { describe, expect, it } from "vitest";
import { PLAY_TEMPLATES } from "../data/templates";
import type { Play } from "../types";
import { playerPositionAtTime } from "../utils/geometry";
import { analyzePlay } from "./analysis";

const counter = () => structuredClone(PLAY_TEMPLATES.find((play) => play.id === "pistol-counter")!);

describe("spatial coach analysis", () => {
  it("produces deterministic stable findings and an explicit risk disclaimer", () => {
    const first = analyzePlay(counter(), "all", 8);
    const second = analyzePlay(counter(), "all", 8);
    expect(first.map((finding) => finding.id)).toEqual(second.map((finding) => finding.id));
    expect(first.length).toBeGreaterThan(0);
    expect(first[0].playerIds).toContain("d-olb-r");
    expect(first[0].title).toContain("#52");
    expect(first.every((finding) => finding.disclaimer.includes("not an outcome prediction"))).toBe(true);
  });

  it("holds an unassigned defender at the starting landmark", () => {
    const play = counter();
    const safety = play.players.find((player) => player.id === "d-ss")!;
    expect(play.assignments.some((assignment) => assignment.playerId === safety.id)).toBe(false);
    expect(playerPositionAtTime(play, safety.id, 0)).toEqual(safety.start);
    expect(playerPositionAtTime(play, safety.id, play.duration)).toEqual(safety.start);
  });

  it("detects run threats and removes one when a blocker arrives early", () => {
    const play: Play = {
      id: "run-test",
      name: "Run Test",
      formation: "Test",
      personnel: "11",
      duration: 2,
      updatedAt: "rev-1",
      players: [
        { id: "runner", team: "offense", number: 22, position: "HB", start: { x: 0, y: 20 } },
        { id: "blocker", team: "offense", number: 66, position: "RG", start: { x: 1, y: 21 } },
        { id: "defender", team: "defense", number: 52, position: "OLB", start: { x: 4, y: 20 } },
      ],
      assignments: [
        { id: "run", playerId: "runner", kind: "run", color: "#fff", startTime: 0, duration: 1.5, segments: [{ type: "line", to: { x: 6, y: 20 } }] },
      ],
    };
    expect(analyzePlay(play, "run").some((finding) => finding.category === "run_threat")).toBe(true);
    play.assignments.push({
      id: "block",
      playerId: "blocker",
      kind: "block",
      color: "#fff",
      startTime: 0,
      duration: 0.2,
      segments: [{ type: "line", to: { x: 4, y: 20 } }],
    });
    expect(analyzePlay(play, "run").some((finding) => finding.category === "run_threat")).toBe(false);
  });

  it("flags route congestion sustained for at least a quarter second", () => {
    const play: Play = {
      id: "pass-test",
      name: "Pass Test",
      formation: "Test",
      personnel: "10",
      duration: 2,
      updatedAt: "rev-1",
      players: [
        { id: "a", team: "offense", number: 11, position: "WR", start: { x: 0, y: 10 } },
        { id: "b", team: "offense", number: 18, position: "WR", start: { x: 0, y: 12 } },
        { id: "d", team: "defense", number: 2, position: "CB", start: { x: 8, y: 30 } },
      ],
      assignments: [
        { id: "a1", playerId: "a", kind: "route", color: "#fff", startTime: 0, duration: 1.5, segments: [{ type: "line", to: { x: 8, y: 11 } }] },
        { id: "a2", playerId: "b", kind: "route", color: "#fff", startTime: 0, duration: 1.5, segments: [{ type: "line", to: { x: 8, y: 11.5 } }] },
      ],
    };
    expect(analyzePlay(play, "pass").some((finding) => finding.category === "route_congestion")).toBe(true);
  });
});
