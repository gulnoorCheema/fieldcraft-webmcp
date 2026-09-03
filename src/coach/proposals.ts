import { COLORS } from "../data/templates";
import type {
  AgentChange,
  AgentPaletteColor,
  AgentProposal,
  Assignment,
  AssignmentKind,
  PathSegment,
  Play,
  Player,
  Point,
  StagePlayChangesInput,
} from "../types";
import { clamp } from "../utils/geometry";
import { createPresetAssignment, ROUTE_PRESETS } from "../utils/presets";
import { analyzePlay } from "./analysis";

export const AGENT_COLORS: Record<AgentPaletteColor, string> = COLORS;
export const AGENT_PRESETS = [...ROUTE_PRESETS, "block", "rush", "drop"] as const;

const offenseKinds = new Set<AssignmentKind>(["route", "run", "block", "motion"]);
const defenseKinds = new Set<AssignmentKind>(["rush", "drop", "blitz", "man"]);
const presetNames = new Set<string>(AGENT_PRESETS);
const paletteNames = new Set<string>(Object.keys(AGENT_COLORS));
const allowedTopKeys = new Set([
  "basePlayId",
  "baseUpdatedAt",
  "mode",
  "name",
  "rationale",
  "targetFindingId",
  "changes",
]);

function fail(message: string): never {
  throw new Error(message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requiredString = (value: unknown, label: string, maxLength = 180): string => {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required.`);
  if (value.length > maxLength) fail(`${label} is too long.`);
  return value.trim();
};

const optionalString = (value: unknown, label: string, maxLength = 180): string | undefined => {
  if (value === undefined) return undefined;
  return requiredString(value, label, maxLength);
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a number.`);
  return value;
};

const parsePoint = (value: unknown, label: string): Point => {
  if (!isRecord(value)) fail(`${label} must be a point.`);
  const x = finiteNumber(value.x, `${label}.x`);
  const y = finiteNumber(value.y, `${label}.y`);
  if (x < 0 || x > 40 || y < 0 || y > 53.3) {
    fail(`${label} must stay inside 0–40 × 0–53.3 football coordinates.`);
  }
  return { x, y };
};

const parseKind = (value: unknown, label: string): AssignmentKind => {
  if (
    value !== "route" && value !== "run" && value !== "block" && value !== "motion"
    && value !== "rush" && value !== "drop" && value !== "blitz" && value !== "man"
  ) fail(`${label} is not a supported assignment kind.`);
  return value;
};

const parseColor = (value: unknown): AgentPaletteColor => {
  if (typeof value !== "string" || !paletteNames.has(value)) {
    fail("color must be a Fieldcraft palette name.");
  }
  return value as AgentPaletteColor;
};

const parseSegments = (value: unknown): PathSegment[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    fail("segments must contain 1–6 path segments.");
  }
  return value.map((segment, index) => {
    if (!isRecord(segment) || (segment.type !== "line" && segment.type !== "curve")) {
      return fail(`segments[${index}] is invalid.`);
    }
    const to = parsePoint(segment.to, `segments[${index}].to`);
    if (segment.type === "line") return { type: "line", to };
    return {
      type: "curve",
      control: parsePoint(segment.control, `segments[${index}].control`),
      to,
    };
  });
};

const validateTiming = (
  startTime: number,
  duration: number,
  playDuration: number,
) => {
  if (startTime < 0 || startTime > playDuration) fail("startTime is outside the play duration.");
  if (duration < 0.05 || duration > playDuration) fail("duration is outside the play duration.");
  if (startTime + duration > playDuration + 0.001) {
    fail("assignment timing extends beyond the play duration.");
  }
};

const ensurePlayerKind = (player: Player, kind: AssignmentKind) => {
  const allowed = player.team === "offense" ? offenseKinds : defenseKinds;
  if (!allowed.has(kind)) fail(`${kind} is not valid for ${player.team} player ${player.id}.`);
};

const getPlayer = (play: Play, playerId: unknown): Player => {
  const id = requiredString(playerId, "playerId", 80);
  const player = play.players.find((candidate) => candidate.id === id);
  if (!player) fail(`Player ${id} does not exist in ${play.name}.`);
  return player;
};

const parseChange = (value: unknown, play: Play): AgentChange => {
  if (!isRecord(value) || typeof value.type !== "string") fail("Each change needs a type.");
  if (value.type === "move_player") {
    const player = getPlayer(play, value.playerId);
    return { type: "move_player", playerId: player.id, to: parsePoint(value.to, "to") };
  }
  if (value.type === "apply_preset") {
    const player = getPlayer(play, value.playerId);
    const kind = parseKind(value.kind, "kind");
    ensurePlayerKind(player, kind);
    const preset = requiredString(value.preset, "preset", 30).toLowerCase();
    if (!presetNames.has(preset)) fail(`${preset} is not a supported preset.`);
    if (kind === "route" && !ROUTE_PRESETS.includes(preset as (typeof ROUTE_PRESETS)[number])) {
      fail("Route assignments require a route preset.");
    }
    if (kind !== "route" && preset !== kind) fail(`${kind} requires the ${kind} preset.`);
    const startTime = value.startTime === undefined ? undefined : finiteNumber(value.startTime, "startTime");
    const duration = value.duration === undefined ? undefined : finiteNumber(value.duration, "duration");
    validateTiming(startTime ?? 0, duration ?? (kind === "block" ? 1.25 : 2.4), play.duration);
    const targetPlayerId = optionalString(value.targetPlayerId, "targetPlayerId", 80);
    if (targetPlayerId && !play.players.some((candidate) => candidate.id === targetPlayerId)) {
      fail(`Target player ${targetPlayerId} does not exist.`);
    }
    const depth = value.depth === undefined ? undefined : finiteNumber(value.depth, "depth");
    if (depth !== undefined && (depth < -20 || depth > 25)) fail("depth must be between -20 and 25 yd.");
    return {
      type: "apply_preset",
      playerId: player.id,
      preset,
      kind,
      startTime,
      duration,
      depth,
      targetPlayerId,
      technique: optionalString(value.technique, "technique", 40),
      color: value.color === undefined ? undefined : parseColor(value.color),
    };
  }
  if (value.type === "set_assignment") {
    const player = getPlayer(play, value.playerId);
    const kind = parseKind(value.kind, "kind");
    ensurePlayerKind(player, kind);
    const startTime = finiteNumber(value.startTime, "startTime");
    const duration = finiteNumber(value.duration, "duration");
    validateTiming(startTime, duration, play.duration);
    const targetPlayerId = optionalString(value.targetPlayerId, "targetPlayerId", 80);
    if (targetPlayerId && !play.players.some((candidate) => candidate.id === targetPlayerId)) {
      fail(`Target player ${targetPlayerId} does not exist.`);
    }
    return {
      type: "set_assignment",
      playerId: player.id,
      kind,
      segments: parseSegments(value.segments),
      color: parseColor(value.color),
      startTime,
      duration,
      targetPlayerId,
      preset: optionalString(value.preset, "preset", 30),
      technique: optionalString(value.technique, "technique", 40),
    };
  }
  if (value.type === "retime_assignment") {
    const player = getPlayer(play, value.playerId);
    const assignment = play.assignments.find((candidate) => candidate.playerId === player.id);
    if (!assignment) fail(`Player ${player.id} has no assignment to retime.`);
    const startTime = value.startTime === undefined ? undefined : finiteNumber(value.startTime, "startTime");
    const duration = value.duration === undefined ? undefined : finiteNumber(value.duration, "duration");
    if (startTime === undefined && duration === undefined) fail("retime_assignment needs startTime or duration.");
    validateTiming(startTime ?? assignment.startTime, duration ?? assignment.duration, play.duration);
    return { type: "retime_assignment", playerId: player.id, startTime, duration };
  }
  if (value.type === "remove_assignment") {
    const player = getPlayer(play, value.playerId);
    if (!play.assignments.some((candidate) => candidate.playerId === player.id)) {
      fail(`Player ${player.id} has no assignment to remove.`);
    }
    return { type: "remove_assignment", playerId: player.id };
  }
  if (value.type === "rename_play") {
    return { type: "rename_play", name: requiredString(value.name, "name", 60) };
  }
  return fail(`Unsupported change type ${value.type}.`);
};

export const parseStageInput = (value: unknown, play: Play): StagePlayChangesInput => {
  if (!isRecord(value)) fail("Tool input must be an object.");
  for (const key of Object.keys(value)) {
    if (!allowedTopKeys.has(key)) fail(`Unexpected input property ${key}.`);
  }
  const basePlayId = requiredString(value.basePlayId, "basePlayId", 80);
  const baseUpdatedAt = requiredString(value.baseUpdatedAt, "baseUpdatedAt", 80);
  if (basePlayId !== play.id) fail("basePlayId does not match the requested play.");
  if (baseUpdatedAt !== play.updatedAt) fail("The play changed; refresh it before staging edits.");
  if (value.mode !== "edit" && value.mode !== "variation") fail("mode must be edit or variation.");
  const name = optionalString(value.name, "name", 60);
  if (value.mode === "variation" && !name) fail("variation mode requires a new name.");
  const rationale = requiredString(value.rationale, "rationale", 500);
  const targetFindingId = optionalString(value.targetFindingId, "targetFindingId", 180);
  if (!Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > 12) {
    fail("changes must contain 1–12 operations.");
  }
  return {
    basePlayId,
    baseUpdatedAt,
    mode: value.mode,
    name,
    rationale,
    targetFindingId,
    changes: value.changes.map((change) => parseChange(change, play)),
  };
};

const shiftAssignment = (assignment: Assignment, delta: Point) => {
  assignment.segments = assignment.segments.map((segment) =>
    segment.type === "line"
      ? { ...segment, to: { x: segment.to.x + delta.x, y: segment.to.y + delta.y } }
      : {
          ...segment,
          control: { x: segment.control.x + delta.x, y: segment.control.y + delta.y },
          to: { x: segment.to.x + delta.x, y: segment.to.y + delta.y },
        },
  );
};

const assignmentId = (playerId: string) =>
  `agent-${playerId}-${Date.now().toString(36)}`;

export const applyAgentChanges = (play: Play, changes: AgentChange[]): Play => {
  const preview = structuredClone(play);
  for (const change of changes) {
    if (change.type === "move_player") {
      const player = preview.players.find((candidate) => candidate.id === change.playerId)!;
      const delta = { x: change.to.x - player.start.x, y: change.to.y - player.start.y };
      player.start = { ...change.to };
      preview.assignments
        .filter((assignment) => assignment.playerId === player.id)
        .forEach((assignment) => shiftAssignment(assignment, delta));
    }
    if (change.type === "apply_preset") {
      const player = preview.players.find((candidate) => candidate.id === change.playerId)!;
      const assignment = createPresetAssignment(player, change.preset, change.kind);
      assignment.id = assignmentId(player.id);
      assignment.startTime = change.startTime ?? assignment.startTime;
      assignment.duration = change.duration ?? assignment.duration;
      assignment.targetPlayerId = change.targetPlayerId;
      assignment.technique = change.technique ?? assignment.technique;
      if (change.color) assignment.color = AGENT_COLORS[change.color];
      if (change.depth !== undefined) {
        const end = assignment.segments.at(-1)!;
        end.to.x = clamp(player.start.x + change.depth, 0, 40);
      }
      preview.assignments = preview.assignments.filter((item) => item.playerId !== player.id);
      preview.assignments.push(assignment);
    }
    if (change.type === "set_assignment") {
      preview.assignments = preview.assignments.filter((item) => item.playerId !== change.playerId);
      preview.assignments.push({
        id: assignmentId(change.playerId),
        playerId: change.playerId,
        kind: change.kind,
        segments: structuredClone(change.segments),
        color: AGENT_COLORS[change.color],
        startTime: change.startTime,
        duration: change.duration,
        targetPlayerId: change.targetPlayerId,
        preset: change.preset,
        technique: change.technique,
      });
    }
    if (change.type === "retime_assignment") {
      const assignment = preview.assignments.find((item) => item.playerId === change.playerId)!;
      if (change.startTime !== undefined) assignment.startTime = change.startTime;
      if (change.duration !== undefined) assignment.duration = change.duration;
    }
    if (change.type === "remove_assignment") {
      preview.assignments = preview.assignments.filter((item) => item.playerId !== change.playerId);
    }
    if (change.type === "rename_play") preview.name = change.name;
  }
  return preview;
};

export const buildAgentProposal = (play: Play, rawInput: unknown): AgentProposal => {
  const input = parseStageInput(rawInput, play);
  const previewPlay = applyAgentChanges(play, input.changes);
  previewPlay.name = input.mode === "variation" ? input.name! : previewPlay.name;
  previewPlay.updatedAt = play.updatedAt;
  const beforeFindings = analyzePlay(play);
  const afterFindings = analyzePlay(previewPlay);
  if (input.targetFindingId && !beforeFindings.some((finding) => finding.id === input.targetFindingId)) {
    fail("targetFindingId is not present in the current analysis.");
  }
  return {
    id: `proposal-${Date.now().toString(36)}`,
    basePlayId: play.id,
    baseUpdatedAt: play.updatedAt,
    mode: input.mode,
    name: previewPlay.name,
    rationale: input.rationale,
    targetFindingId: input.targetFindingId,
    changes: input.changes,
    previewPlay,
    beforeFindings,
    afterFindings,
  };
};

export const isProposalTargetResolved = (proposal: AgentProposal) => {
  if (!proposal.targetFindingId) return undefined;
  const target = proposal.beforeFindings.find((finding) => finding.id === proposal.targetFindingId);
  if (!target) return undefined;
  const keyActors = target.playerIds.slice(0, 2);
  return !proposal.afterFindings.some(
    (finding) => finding.category === target.category
      && keyActors.every((playerId) => finding.playerIds.includes(playerId)),
  );
};

export const describeAgentChange = (change: AgentChange, play: Play) => {
  const playerId = "playerId" in change ? change.playerId : undefined;
  const player = playerId ? play.players.find((candidate) => candidate.id === playerId) : undefined;
  const label = player ? `#${player.number} ${player.position}` : "Play";
  if (change.type === "move_player") return `${label} landmark → ${change.to.x.toFixed(1)}, ${change.to.y.toFixed(1)}`;
  if (change.type === "apply_preset") return `${label} → ${change.preset.toUpperCase()} ${change.kind}`;
  if (change.type === "set_assignment") return `${label} → custom ${change.kind}`;
  if (change.type === "retime_assignment") {
    return `${label} timing → ${change.startTime ?? "same"}s / ${change.duration ?? "same"}s`;
  }
  if (change.type === "remove_assignment") return `${label} assignment removed`;
  return `Rename → ${change.name}`;
};
