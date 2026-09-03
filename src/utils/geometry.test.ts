import { describe, expect, it } from "vitest";
import { PLAY_TEMPLATES } from "../data/templates";
import type { Assignment } from "../types";
import {
  assignmentPointAtProgress,
  assignmentProgressAtTime,
  fieldToSvg,
  playerPositionAtTime,
  resolveMarkerCollisions,
  snapPoint,
  svgToField,
} from "./geometry";

const route: Assignment = {
  id: "route",
  playerId: "player",
  kind: "route",
  color: "#fff",
  startTime: 0.5,
  duration: 2,
  segments: [{ type: "line", to: { x: 10, y: 0 } }],
};

describe("football geometry", () => {
  it("round trips football and SVG coordinates", () => {
    const point = { x: 18.5, y: 31.25 };
    const roundTrip = svgToField(fieldToSvg(point));
    expect(roundTrip.x).toBeCloseTo(point.x);
    expect(roundTrip.y).toBeCloseTo(point.y);

    const adaptiveWidth = 1438;
    const adaptiveRoundTrip = svgToField(fieldToSvg(point, adaptiveWidth), adaptiveWidth);
    expect(adaptiveRoundTrip.x).toBeCloseTo(point.x);
    expect(adaptiveRoundTrip.y).toBeCloseTo(point.y);
  });

  it("snaps to half-yard increments and supports bypass", () => {
    expect(snapPoint({ x: 10.26, y: 20.74 })).toEqual({ x: 10.5, y: 20.5 });
    expect(snapPoint({ x: 10.26, y: 20.74 }, false)).toEqual({ x: 10.26, y: 20.74 });
  });

  it("uses the same timing progress for paths and player playback", () => {
    expect(assignmentProgressAtTime(route, 0.25)).toBe(0);
    expect(assignmentProgressAtTime(route, 1.5)).toBe(0.5);
    expect(assignmentPointAtProgress({ x: 0, y: 0 }, route, 0.5)).toEqual({ x: 5, y: 0 });

    const counter = PLAY_TEMPLATES.find((play) => play.id === "pistol-counter")!;
    const guard = counter.players.find((player) => player.id === "o-rg")!;
    const guardAssignment = counter.assignments.find((assignment) => assignment.playerId === guard.id)!;
    const position = playerPositionAtTime(counter, guard.id, 1.4);
    const expected = assignmentPointAtProgress(
      guard.start,
      guardAssignment,
      assignmentProgressAtTime(guardAssignment, 1.4),
    );
    expect(position.x).toBeCloseTo(expected.x);
    expect(position.y).toBeCloseTo(expected.y);
  });

  it("separates contact markers without moving the selected player's anchor", () => {
    const resolved = resolveMarkerCollisions([
      { id: "carrier", team: "offense", point: { x: 100, y: 100 }, priority: 2 },
      { id: "tackler", team: "defense", point: { x: 104, y: 102 } },
    ]);
    const carrier = resolved.get("carrier")!;
    const tackler = resolved.get("tackler")!;

    expect(carrier).toEqual({ x: 100, y: 100 });
    expect(Math.hypot(tackler.x - carrier.x, tackler.y - carrier.y)).toBeGreaterThanOrEqual(30.9);
  });
});
