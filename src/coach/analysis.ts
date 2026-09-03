import type {
  AnalysisCategory,
  AnalysisFinding,
  AnalysisSeverity,
  Assignment,
  Play,
  Player,
  Point,
} from "../types";
import { playerPositionAtTime } from "../utils/geometry";

export const ANALYSIS_STEP = 0.05;
export const ANALYSIS_DISCLAIMER = "Spatial/timing risk, not an outcome prediction." as const;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (value: number) => Number(value.toFixed(2));
const playerLabel = (player: Player | undefined) =>
  player ? `#${player.number} ${player.position}` : "unknown player";

const severityRank: Record<AnalysisSeverity, number> = {
  critical: 0,
  warning: 1,
  note: 2,
};

const stableId = (
  category: AnalysisCategory,
  playerIds: string[],
  focusTime: number,
) => `${category}:${[...playerIds].sort().join("+")}:${round(focusTime).toFixed(2)}`;

const sampleTimes = (duration: number) => {
  const count = Math.ceil(duration / ANALYSIS_STEP);
  return Array.from({ length: count + 1 }, (_, index) =>
    round(Math.min(duration, index * ANALYSIS_STEP)),
  );
};

type DistanceSample = { time: number; distance: number };

const contiguousWindows = (samples: DistanceSample[], threshold: number) => {
  const windows: DistanceSample[][] = [];
  let active: DistanceSample[] = [];
  for (const sample of samples) {
    if (sample.distance <= threshold) {
      active.push(sample);
    } else if (active.length) {
      windows.push(active);
      active = [];
    }
  }
  if (active.length) windows.push(active);
  return windows;
};

const assignmentFor = (play: Play, playerId: string) =>
  play.assignments.find((assignment) => assignment.playerId === playerId);

type BlockRead = {
  blocker?: Player;
  arrival?: number;
  closestDistance: number;
  status: "early" | "late" | "absent";
  margin?: number;
};

const readBlockTiming = (
  play: Play,
  defender: Player,
  threatStart: number,
  threatEnd: number,
  times: number[],
): BlockRead => {
  const blockers = play.assignments
    .filter((assignment) => assignment.kind === "block")
    .map((assignment) => ({
      assignment,
      player: play.players.find((player) => player.id === assignment.playerId),
    }))
    .filter((item): item is { assignment: Assignment; player: Player } => Boolean(item.player));

  let best: { blocker: Player; arrival?: number; closestDistance: number } | undefined;
  for (const blocker of blockers) {
    let arrival: number | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const time of times) {
      if (time > Math.min(play.duration, threatEnd + 0.35)) break;
      const separation = distance(
        playerPositionAtTime(play, blocker.player.id, time),
        playerPositionAtTime(play, defender.id, time),
      );
      closestDistance = Math.min(closestDistance, separation);
      if (arrival === undefined && separation <= 1.25) arrival = time;
    }
    if (!best || closestDistance < best.closestDistance) {
      best = { blocker: blocker.player, arrival, closestDistance };
    }
  }

  if (!best || best.arrival === undefined) {
    return {
      blocker: best?.blocker,
      closestDistance: best?.closestDistance ?? Number.POSITIVE_INFINITY,
      status: "absent",
    };
  }
  const margin = round(threatStart - best.arrival);
  return {
    blocker: best.blocker,
    arrival: best.arrival,
    closestDistance: best.closestDistance,
    status: best.arrival <= threatStart - 0.15 ? "early" : "late",
    margin,
  };
};

const runThreats = (play: Play, times: number[]): AnalysisFinding[] => {
  const runners = play.assignments.filter((assignment) => assignment.kind === "run");
  const defenders = play.players.filter((player) => player.team === "defense");
  const findings: AnalysisFinding[] = [];

  for (const run of runners) {
    const runner = play.players.find((player) => player.id === run.playerId);
    if (!runner) continue;
    for (const defender of defenders) {
      const samples = times.map((time) => ({
        time,
        distance: distance(
          playerPositionAtTime(play, runner.id, time),
          playerPositionAtTime(play, defender.id, time),
        ),
      }));
      for (const window of contiguousWindows(samples, 1.75)) {
        const closest = window.reduce((best, sample) =>
          sample.distance < best.distance ? sample : best,
        );
        const threatStart = window[0].time;
        const threatEnd = window.at(-1)!.time;
        const block = readBlockTiming(play, defender, threatStart, threatEnd, times);
        if (block.status === "early") continue;
        const lateBy = block.arrival === undefined ? undefined : round(block.arrival - threatStart);
        const actors = [runner.id, defender.id, ...(block.blocker ? [block.blocker.id] : [])];
        const side = defender.start.y >= 26.65 ? "right" : "left";
        const title = block.status === "absent"
          ? `${playerLabel(defender)} has an unaccounted ${side}-side fit`
          : `${playerLabel(defender)} reaches the lane before ${playerLabel(block.blocker)}`;
        const evidence = block.status === "absent"
          ? `${playerLabel(defender)} closes to ${closest.distance.toFixed(2)} yd of ${playerLabel(runner)} at ${closest.time.toFixed(2)}s; no blocker arrives within 1.25 yd.`
          : `${playerLabel(defender)} closes to ${closest.distance.toFixed(2)} yd at ${closest.time.toFixed(2)}s; ${playerLabel(block.blocker)} arrives ${lateBy?.toFixed(2)}s after the window opens.`;
        findings.push({
          id: stableId("run_threat", actors, closest.time),
          severity: closest.time < play.duration - 0.25 ? "critical" : "warning",
          category: "run_threat",
          title,
          playerIds: actors,
          startTime: threatStart,
          endTime: threatEnd,
          focusTime: closest.time,
          minimumDistance: round(closest.distance),
          timingMargin: block.margin,
          blockStatus: block.status,
          evidence,
          disclaimer: ANALYSIS_DISCLAIMER,
        });
      }
    }
  }
  return findings;
};

const pressureFindings = (play: Play, times: number[]): AnalysisFinding[] => {
  const quarterback = play.players.find(
    (player) => player.team === "offense" && player.position === "QB",
  );
  if (!quarterback) return [];
  const rushers = play.assignments.filter(
    (assignment) => assignment.kind === "rush" || assignment.kind === "blitz",
  );
  const findings: AnalysisFinding[] = [];

  for (const rush of rushers) {
    const defender = play.players.find((player) => player.id === rush.playerId);
    if (!defender) continue;
    const samples = times.map((time) => ({
      time,
      distance: distance(
        playerPositionAtTime(play, defender.id, time),
        playerPositionAtTime(play, quarterback.id, time),
      ),
    }));
    for (const window of contiguousWindows(samples, 2)) {
      const closest = window.reduce((best, sample) =>
        sample.distance < best.distance ? sample : best,
      );
      const block = readBlockTiming(play, defender, window[0].time, window.at(-1)!.time, times);
      if (block.status === "early") continue;
      const actors = [quarterback.id, defender.id, ...(block.blocker ? [block.blocker.id] : [])];
      findings.push({
        id: stableId("pressure", actors, closest.time),
        severity: "critical",
        category: "pressure",
        title: `${playerLabel(defender)} enters the quarterback's pressure radius`,
        playerIds: actors,
        startTime: window[0].time,
        endTime: window.at(-1)!.time,
        focusTime: closest.time,
        minimumDistance: round(closest.distance),
        timingMargin: block.margin,
        blockStatus: block.status,
        evidence: `${playerLabel(defender)} gets within ${closest.distance.toFixed(2)} yd of ${playerLabel(quarterback)} at ${closest.time.toFixed(2)}s; protection is ${block.status}.`,
        disclaimer: ANALYSIS_DISCLAIMER,
      });
    }
  }
  return findings;
};

const routeCongestion = (play: Play, times: number[]): AnalysisFinding[] => {
  const routes = play.assignments.filter((assignment) => assignment.kind === "route");
  const findings: AnalysisFinding[] = [];
  for (let left = 0; left < routes.length; left += 1) {
    for (let right = left + 1; right < routes.length; right += 1) {
      const a = routes[left];
      const b = routes[right];
      const samples = times
        .filter((time) => time >= 0.5)
        .map((time) => ({
          time,
          distance: distance(
            playerPositionAtTime(play, a.playerId, time),
            playerPositionAtTime(play, b.playerId, time),
          ),
        }));
      for (const window of contiguousWindows(samples, 3)) {
        if (window.at(-1)!.time - window[0].time + ANALYSIS_STEP < 0.25) continue;
        const closest = window.reduce((best, sample) =>
          sample.distance < best.distance ? sample : best,
        );
        const first = play.players.find((player) => player.id === a.playerId);
        const second = play.players.find((player) => player.id === b.playerId);
        const actors = [a.playerId, b.playerId];
        findings.push({
          id: stableId("route_congestion", actors, closest.time),
          severity: "warning",
          category: "route_congestion",
          title: `${playerLabel(first)} and ${playerLabel(second)} compress the same space`,
          playerIds: actors,
          startTime: window[0].time,
          endTime: window.at(-1)!.time,
          focusTime: closest.time,
          minimumDistance: round(closest.distance),
          evidence: `The routes stay within 3.00 yd for ${(window.at(-1)!.time - window[0].time + ANALYSIS_STEP).toFixed(2)}s, tightening the throwing window.`,
          disclaimer: ANALYSIS_DISCLAIMER,
        });
      }
    }
  }
  return findings;
};

const uncoveredTerminals = (play: Play): AnalysisFinding[] => {
  const defenders = play.players.filter((player) => player.team === "defense");
  return play.assignments
    .filter((assignment) => assignment.kind === "route")
    .flatMap((assignment) => {
      const receiver = play.players.find((player) => player.id === assignment.playerId);
      if (!receiver || !defenders.length) return [];
      const finish = Math.min(play.duration, assignment.startTime + assignment.duration);
      const receiverPoint = playerPositionAtTime(play, receiver.id, finish);
      const nearest = defenders
        .map((defender) => ({
          defender,
          distance: distance(receiverPoint, playerPositionAtTime(play, defender.id, finish)),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest.distance <= 5) return [];
      const actors = [receiver.id, nearest.defender.id];
      return [{
        id: stableId("uncovered_terminal", actors, finish),
        severity: "note" as const,
        category: "uncovered_terminal" as const,
        title: `${playerLabel(receiver)} finishes beyond the nearest landmark`,
        playerIds: actors,
        startTime: finish,
        endTime: finish,
        focusTime: finish,
        minimumDistance: round(nearest.distance),
        evidence: `At route completion, the nearest defender is ${nearest.distance.toFixed(2)} yd away. Treat this as a spacing cue, not a completion forecast.`,
        disclaimer: ANALYSIS_DISCLAIMER,
      }];
    });
};

const timingFindings = (play: Play): AnalysisFinding[] =>
  play.assignments.flatMap((assignment) => {
    const endTime = assignment.startTime + assignment.duration;
    if (endTime <= play.duration + 0.001) return [];
    const player = play.players.find((candidate) => candidate.id === assignment.playerId);
    return [{
      id: stableId("play_timing", [assignment.playerId], play.duration),
      severity: "warning" as const,
      category: "play_timing" as const,
      title: `${playerLabel(player)} runs beyond the play clock`,
      playerIds: [assignment.playerId],
      startTime: play.duration,
      endTime: round(endTime),
      focusTime: play.duration,
      timingMargin: round(play.duration - endTime),
      evidence: `The assignment ends at ${endTime.toFixed(2)}s, ${Math.abs(play.duration - endTime).toFixed(2)}s after the ${play.duration.toFixed(2)}s play duration.`,
      disclaimer: ANALYSIS_DISCLAIMER,
    }];
  });

export type AnalysisFocus = "all" | "run" | "pass" | "protection";

export const analyzePlay = (
  play: Play,
  focus: AnalysisFocus = "all",
  limit = 8,
): AnalysisFinding[] => {
  const times = sampleTimes(play.duration);
  const allowed: Record<AnalysisFocus, AnalysisCategory[]> = {
    all: ["run_threat", "block_timing", "pressure", "route_congestion", "uncovered_terminal", "play_timing"],
    run: ["run_threat", "block_timing", "play_timing"],
    pass: ["route_congestion", "uncovered_terminal", "play_timing"],
    protection: ["pressure", "play_timing"],
  };
  return [
    ...runThreats(play, times),
    ...pressureFindings(play, times),
    ...routeCongestion(play, times),
    ...uncoveredTerminals(play),
    ...timingFindings(play),
  ]
    .filter((finding) => allowed[focus].includes(finding.category))
    .sort((a, b) =>
      severityRank[a.severity] - severityRank[b.severity]
      || a.focusTime - b.focusTime
      || a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(1, Math.min(8, limit)));
};
