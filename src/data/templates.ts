import type {
  Assignment,
  AssignmentKind,
  PathSegment,
  Play,
  PlaybookDocument,
  Player,
  Point,
} from "../types";

export const COLORS = {
  orange: "#ff6a00",
  blue: "#6aaeff",
  yellow: "#e7c84b",
  coral: "#ef5d52",
  bone: "#eee9dd",
  olive: "#8eaa59",
} as const;

const now = "2026-09-03T00:00:00.000Z";

const player = (
  id: string,
  team: Player["team"],
  number: number,
  position: string,
  x: number,
  y: number,
): Player => ({ id, team, number, position, start: { x, y } });

const basePlayers = (): Player[] => [
  player("o-wr-l", "offense", 18, "WR", 17, 4.5),
  player("o-lt", "offense", 74, "LT", 17, 18.5),
  player("o-lg", "offense", 69, "LG", 17, 22.5),
  player("o-c", "offense", 55, "C", 17, 26.65),
  player("o-rg", "offense", 66, "RG", 17, 30.8),
  player("o-rt", "offense", 71, "RT", 17, 34.8),
  player("o-te", "offense", 87, "TE", 17, 39.1),
  player("o-slot", "offense", 11, "WR", 17, 44),
  player("o-qb", "offense", 1, "QB", 14.2, 26.65),
  player("o-hb", "offense", 22, "HB", 11.3, 26.65),
  player("o-wr-r", "offense", 84, "WR", 17, 49.5),
  player("d-cb-l", "defense", 2, "CB", 25.5, 4.5),
  player("d-de-l", "defense", 94, "DE", 20.7, 18.8),
  player("d-dt-l", "defense", 95, "DT", 20.7, 23.8),
  player("d-nt", "defense", 99, "NT", 20.7, 29),
  player("d-de-r", "defense", 90, "DE", 20.7, 35),
  player("d-olb-l", "defense", 31, "OLB", 24, 16),
  player("d-mlb", "defense", 45, "MLB", 24.5, 26.65),
  player("d-olb-r", "defense", 52, "OLB", 24, 37.5),
  player("d-cb-r", "defense", 27, "CB", 25.5, 49.5),
  player("d-fs", "defense", 21, "FS", 29, 17.5),
  player("d-ss", "defense", 26, "SS", 29, 38),
];

const adjustFormation = (formation: string): Player[] => {
  const players = basePlayers();
  const set = (id: string, point: Point) => {
    const target = players.find((item) => item.id === id);
    if (target) target.start = point;
  };

  if (formation === "Gun Bunch") {
    set("o-qb", { x: 13.2, y: 26.65 });
    set("o-hb", { x: 13.4, y: 20.8 });
    set("o-te", { x: 16.2, y: 37.5 });
    set("o-slot", { x: 15.3, y: 41 });
    set("o-wr-r", { x: 14.4, y: 44.7 });
  }
  if (formation === "Trips Right") {
    set("o-qb", { x: 13.1, y: 26.65 });
    set("o-hb", { x: 13.4, y: 21 });
    set("o-te", { x: 17, y: 37.5 });
    set("o-slot", { x: 16, y: 43 });
    set("o-wr-r", { x: 17, y: 49.5 });
  }
  if (formation === "Pistol") {
    set("o-qb", { x: 14.2, y: 26.65 });
    set("o-hb", { x: 11.3, y: 26.65 });
  }
  if (formation === "Doubles") {
    set("o-slot", { x: 16, y: 42 });
    set("o-te", { x: 16, y: 11.5 });
  }
  return players;
};

const a = (
  id: string,
  playerId: string,
  kind: AssignmentKind,
  color: string,
  segments: PathSegment[],
  duration = 2.4,
  startTime = 0,
  preset?: string,
  technique?: string,
): Assignment => ({
  id,
  playerId,
  kind,
  color,
  segments,
  duration,
  startTime,
  preset,
  technique,
});

const line = (x: number, y: number): PathSegment => ({ type: "line", to: { x, y } });
const curve = (cx: number, cy: number, x: number, y: number): PathSegment => ({
  type: "curve",
  control: { x: cx, y: cy },
  to: { x, y },
});

const protection = (): Assignment[] => [
  a("a-lt", "o-lt", "block", COLORS.bone, [line(20.5, 17.4)], 1.2, 0, "base", "CUT OFF"),
  a("a-lg", "o-lg", "block", COLORS.bone, [line(20.7, 22)], 1.2, 0, "base", "DOWN"),
  a("a-c", "o-c", "block", COLORS.bone, [line(20.8, 26.65)], 1.2, 0, "base", "REACH"),
  a("a-rg", "o-rg", "block", COLORS.bone, [line(20.7, 31.3)], 1.2, 0, "base", "REACH"),
  a("a-rt", "o-rt", "block", COLORS.bone, [line(20.5, 35.7)], 1.2, 0, "base", "HINGE"),
];

const conceptAssignments = (concept: string): Assignment[] => {
  if (concept === "mesh") {
    return [
      ...protection(),
      a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(26, 4.5), curve(30, 4.5, 33, 11)], 2.7, 0, "corner"),
      a("a-te", "o-te", "route", COLORS.yellow, [curve(20, 38, 25.5, 27)], 2.1, 0.1, "drag"),
      a("a-slot", "o-slot", "route", COLORS.blue, [curve(21, 43, 27.5, 29)], 2.2, 0, "mesh"),
      a("a-wrr", "o-wr-r", "route", COLORS.orange, [line(24, 49.5), curve(28, 49, 31, 43)], 2.5, 0, "corner"),
    ];
  }
  if (concept === "flood") {
    return [
      ...protection(),
      a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(34, 4.5)], 2.8, 0, "go"),
      a("a-te", "o-te", "route", COLORS.yellow, [curve(20, 39, 24.5, 45)], 1.7, 0.1, "flat"),
      a("a-slot", "o-slot", "route", COLORS.blue, [line(24, 44), curve(27, 44, 29, 38)], 2.2, 0, "out"),
      a("a-wrr", "o-wr-r", "route", COLORS.coral, [line(28, 49.5), curve(32, 49, 35, 42)], 2.8, 0, "corner"),
      a("a-hb", "o-hb", "route", COLORS.orange, [curve(15, 26, 20, 34), line(24, 38)], 2.1, 0.2, "swing"),
    ];
  }
  if (concept === "stick") {
    return [
      ...protection(),
      a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(34, 4.5)], 2.8, 0, "go"),
      a("a-te", "o-te", "route", COLORS.yellow, [line(23, 39), curve(24, 39, 24.5, 35.5)], 1.8, 0, "stick"),
      a("a-slot", "o-slot", "route", COLORS.blue, [curve(20, 44, 24, 49)], 1.6, 0, "flat"),
      a("a-wrr", "o-wr-r", "route", COLORS.orange, [line(24, 49.5), curve(27, 49, 30, 43)], 2.4, 0, "corner"),
    ];
  }
  if (concept === "verticals") {
    return [
      ...protection(),
      a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(35, 4.5)], 2.9, 0, "go"),
      a("a-te", "o-te", "route", COLORS.yellow, [curve(23, 39, 34, 35)], 2.8, 0, "seam"),
      a("a-slot", "o-slot", "route", COLORS.orange, [curve(23, 44, 34, 42)], 2.8, 0, "seam"),
      a("a-wrr", "o-wr-r", "route", COLORS.blue, [line(35, 49.5)], 2.9, 0, "go"),
      a("a-hb", "o-hb", "route", COLORS.bone, [curve(14, 27, 20, 18)], 1.9, 0.3, "check"),
    ];
  }
  if (concept === "counter") {
    return [
      a("a-lt", "o-lt", "block", COLORS.bone, [line(20.5, 17.5)], 1.15, 0, "base", "CUTOFF"),
      a("a-lg", "o-lg", "block", COLORS.bone, [line(20.7, 22.7)], 1.1, 0, "base", "DOWN"),
      a("a-c", "o-c", "block", COLORS.bone, [line(20.6, 26.65)], 1.1, 0, "base", "BACK"),
      a("a-rg", "o-rg", "block", COLORS.orange, [curve(17.5, 27, 20.5, 27), curve(23, 27, 27, 36.5)], 1.35, 0.05, "counter", "PULL"),
      a("a-rt", "o-rt", "block", COLORS.bone, [line(20.4, 35.5)], 1.15, 0, "base", "HINGE"),
      a("a-te", "o-te", "block", COLORS.bone, [line(20.2, 38)], 1.2, 0, "arc", "ARC"),
      a("a-hb", "o-hb", "run", COLORS.yellow, [curve(15, 26.5, 18.5, 30), curve(22, 33, 29, 37)], 2.15, 0.1, "counter", "A GAP"),
      a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(33, 4.5)], 2.8, 0, "go"),
      a("a-wrr", "o-wr-r", "route", COLORS.blue, [line(32, 49.5)], 2.6, 0, "go"),
      a("a-slot", "o-slot", "motion", COLORS.coral, [curve(14, 44, 13.5, 35)], 1, 0, "orbit"),
      a("a-52", "d-olb-r", "drop", COLORS.yellow, [curve(25.5, 37, 28.6, 35.3)], 1.35, 0.15, "fit", "PLAY-SIDE FIT"),
    ];
  }
  if (concept === "zone") {
    return [
      ...protection().map((item, index) => ({
        ...item,
        id: `z-${index}`,
        segments: [line(21 + index * 0.15, 17.5 + index * 4.3)],
        technique: "ZONE STEP",
      })),
      a("a-hb", "o-hb", "run", COLORS.orange, [curve(15, 26.5, 20.5, 28), line(29, 28.5)], 2.2, 0, "inside zone", "A GAP"),
      a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(28, 4.5)], 2, 0, "release"),
      a("a-slot", "o-slot", "route", COLORS.blue, [line(26, 44)], 1.8, 0, "stalk"),
    ];
  }
  if (concept === "rpo") {
    return [
      ...protection(),
      a("a-hb", "o-hb", "run", COLORS.orange, [curve(15, 26, 21, 25), line(28, 24)], 2.2, 0, "zone", "B GAP"),
      a("a-slot", "o-slot", "route", COLORS.blue, [curve(15, 42, 20, 48), curve(24, 51, 28, 48)], 1.8, 0, "bubble"),
      a("a-wrr", "o-wr-r", "route", COLORS.coral, [line(33, 49.5)], 2.8, 0, "clear"),
      a("a-te", "o-te", "route", COLORS.yellow, [line(23, 39), curve(26, 38, 30, 31)], 2.1, 0, "glance"),
    ];
  }
  return [
    ...protection().filter((item) => item.playerId !== "o-lg" && item.playerId !== "o-rg"),
    a("a-hb", "o-hb", "route", COLORS.orange, [curve(13, 27, 15, 20), curve(19, 15, 26, 17), line(31, 19)], 2.6, 0.45, "screen", "SCREEN"),
    a("a-lg", "o-lg", "block", COLORS.yellow, [curve(19, 23, 23, 19), line(27, 18)], 1.9, 0.4, "release", "LEAD"),
    a("a-rg", "o-rg", "block", COLORS.blue, [curve(19, 31, 23, 25), line(27, 22)], 1.9, 0.4, "release", "ALLEY"),
    a("a-wrl", "o-wr-l", "route", COLORS.coral, [line(33, 4.5)], 2.7, 0, "go"),
    a("a-wrr", "o-wr-r", "route", COLORS.blue, [line(31, 49.5)], 2.5, 0, "go"),
  ];
};

const makePlay = (
  id: string,
  name: string,
  formation: string,
  personnel: string,
  concept: string,
  duration = 4,
): Play => ({
  id,
  name,
  formation,
  personnel,
  duration,
  players: adjustFormation(formation),
  assignments: conceptAssignments(concept),
  updatedAt: now,
});

export const PLAY_TEMPLATES: Play[] = [
  makePlay("gun-bunch-mesh", "Gun Bunch Mesh", "Gun Bunch", "11 personnel", "mesh"),
  makePlay("pistol-counter", "Pistol Counter", "Pistol", "12 personnel", "counter"),
  makePlay("trips-right-flood", "Trips Right Flood", "Trips Right", "11 personnel", "flood"),
  makePlay("y-stick", "Y Stick", "Doubles", "11 personnel", "stick"),
  makePlay("four-verticals", "Four Verticals", "Doubles", "10 personnel", "verticals"),
  makePlay("inside-zone", "Inside Zone", "Pistol", "12 personnel", "zone"),
  makePlay("rpo-bubble", "RPO Bubble", "Trips Right", "11 personnel", "rpo"),
  makePlay("rb-screen", "RB Screen", "Gun Bunch", "11 personnel", "screen"),
];

export const makeInitialPlaybook = (): PlaybookDocument => ({
  schemaVersion: 1,
  selectedPlayId: "pistol-counter",
  plays: structuredClone(PLAY_TEMPLATES),
});
