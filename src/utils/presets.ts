import { COLORS } from "../data/templates";
import type { Assignment, AssignmentKind, Player, Point } from "../types";
import { clamp } from "./geometry";

export const ROUTE_PRESETS = [
  "go",
  "slant",
  "post",
  "corner",
  "out",
  "curl",
  "flat",
  "drag",
  "wheel",
] as const;

const pt = (x: number, y: number): Point => ({
  x: clamp(x, 0.5, 39.5),
  y: clamp(y, 0.5, 52.8),
});

const playerColor = (player: Player) => {
  if (player.id.includes("wr-l")) return COLORS.coral;
  if (player.id.includes("wr-r")) return COLORS.blue;
  if (player.id.includes("slot")) return COLORS.yellow;
  if (player.id.includes("hb")) return COLORS.orange;
  return COLORS.bone;
};

export const createPresetAssignment = (
  player: Player,
  preset: string,
  kind: AssignmentKind = "route",
): Assignment => {
  const { x, y } = player.start;
  const away = y < 26.65 ? -1 : 1;
  const toward = -away;
  const line = (to: Point) => ({ type: "line" as const, to });
  const curve = (control: Point, to: Point) => ({ type: "curve" as const, control, to });

  let segments: Assignment["segments"];
  switch (preset) {
    case "slant":
      segments = [curve(pt(x + 4, y), pt(x + 10, y + toward * 7))];
      break;
    case "post":
      segments = [line(pt(x + 7, y)), curve(pt(x + 10, y), pt(x + 15, y + toward * 8))];
      break;
    case "corner":
      segments = [line(pt(x + 7, y)), curve(pt(x + 10, y), pt(x + 14, y + away * 8))];
      break;
    case "out":
      segments = [line(pt(x + 6, y)), curve(pt(x + 7, y), pt(x + 8, y + away * 7))];
      break;
    case "curl":
      segments = [line(pt(x + 10, y)), curve(pt(x + 10, y + toward), pt(x + 8, y + toward * 1.5))];
      break;
    case "flat":
      segments = [curve(pt(x + 3, y), pt(x + 7, y + away * 6))];
      break;
    case "drag":
      segments = [curve(pt(x + 4, y), pt(x + 9, y + toward * 8))];
      break;
    case "wheel":
      segments = [
        curve(pt(x + 3, y + away * 5), pt(x + 7, y + away * 6)),
        curve(pt(x + 10, y + away * 6), pt(x + 15, y + away * 4)),
      ];
      break;
    case "block":
      segments = [curve(pt(x + 1.5, y), pt(x + 4.5, y + toward * 2.5))];
      break;
    case "rush":
      segments = [curve(pt(x - 2, y), pt(x - 6, 26.65))];
      break;
    case "drop":
      segments = [curve(pt(x + 2, y), pt(x + 6, y + toward * 4))];
      break;
    default:
      segments = [line(pt(x + 16, y))];
  }

  return {
    id: `a-${player.id}-${Date.now()}`,
    playerId: player.id,
    kind,
    segments,
    color: kind === "block" ? COLORS.bone : playerColor(player),
    startTime: 0,
    duration: kind === "block" ? 1.25 : 2.4,
    preset,
    technique: kind === "block" ? "BASE" : preset.toUpperCase(),
  };
};

