export type Point = { x: number; y: number };

export type Team = "offense" | "defense";

export type AssignmentKind =
  | "route"
  | "run"
  | "block"
  | "motion"
  | "rush"
  | "drop"
  | "blitz"
  | "man";

export type PathSegment =
  | { type: "line"; to: Point }
  | { type: "curve"; control: Point; to: Point };

export type Player = {
  id: string;
  team: Team;
  number: number;
  position: string;
  start: Point;
};

export type Assignment = {
  id: string;
  playerId: string;
  kind: AssignmentKind;
  segments: PathSegment[];
  color: string;
  startTime: number;
  duration: number;
  targetPlayerId?: string;
  preset?: string;
  technique?: string;
};

export type Play = {
  id: string;
  name: string;
  formation: string;
  personnel: string;
  duration: number;
  players: Player[];
  assignments: Assignment[];
  updatedAt: string;
};

export type PlaybookDocument = {
  schemaVersion: 1;
  selectedPlayId: string;
  plays: Play[];
};

export type AnalysisSeverity = "critical" | "warning" | "note";

export type AnalysisCategory =
  | "run_threat"
  | "block_timing"
  | "pressure"
  | "route_congestion"
  | "uncovered_terminal"
  | "play_timing";

export type AnalysisFinding = {
  id: string;
  severity: AnalysisSeverity;
  category: AnalysisCategory;
  title: string;
  playerIds: string[];
  startTime: number;
  endTime: number;
  focusTime: number;
  minimumDistance?: number;
  timingMargin?: number;
  blockStatus?: "early" | "late" | "absent";
  evidence: string;
  disclaimer: "Spatial/timing risk, not an outcome prediction.";
};

export type AgentPaletteColor =
  | "orange"
  | "blue"
  | "yellow"
  | "coral"
  | "bone"
  | "olive";

export type AgentChange =
  | { type: "move_player"; playerId: string; to: Point }
  | {
      type: "apply_preset";
      playerId: string;
      preset: string;
      kind: AssignmentKind;
      startTime?: number;
      duration?: number;
      depth?: number;
      targetPlayerId?: string;
      technique?: string;
      color?: AgentPaletteColor;
    }
  | {
      type: "set_assignment";
      playerId: string;
      kind: AssignmentKind;
      segments: PathSegment[];
      color: AgentPaletteColor;
      startTime: number;
      duration: number;
      targetPlayerId?: string;
      preset?: string;
      technique?: string;
    }
  | {
      type: "retime_assignment";
      playerId: string;
      startTime?: number;
      duration?: number;
    }
  | { type: "remove_assignment"; playerId: string }
  | { type: "rename_play"; name: string };

export type StagePlayChangesInput = {
  basePlayId: string;
  baseUpdatedAt: string;
  mode: "edit" | "variation";
  name?: string;
  rationale: string;
  targetFindingId?: string;
  changes: AgentChange[];
};

export type AgentProposal = {
  id: string;
  basePlayId: string;
  baseUpdatedAt: string;
  mode: "edit" | "variation";
  name: string;
  rationale: string;
  targetFindingId?: string;
  changes: AgentChange[];
  previewPlay: Play;
  beforeFindings: AnalysisFinding[];
  afterFindings: AnalysisFinding[];
};

export type AgentFocus = {
  findingId: string;
  playId: string;
  playerIds: string[];
  time: number;
  title: string;
  evidence: string;
  severity: AnalysisSeverity;
  expiresAt: number;
};

export type EditorTool =
  | "select"
  | "move"
  | "draw"
  | "route"
  | "block"
  | "assign"
  | "erase";

export type EditorCommand =
  | { type: "player.move"; positions: Record<string, Point> }
  | { type: "player.update"; playerId: string; patch: Partial<Pick<Player, "number" | "position">> }
  | { type: "player.delete"; playerId: string }
  | { type: "players.duplicate"; playerIds: string[]; offset: Point }
  | { type: "assignment.upsert"; assignment: Assignment }
  | { type: "assignment.update"; assignmentId: string; patch: Partial<Assignment> }
  | { type: "assignment.delete"; assignmentId: string }
  | { type: "play.select"; playId: string }
  | { type: "play.rename"; playId: string; name: string }
  | { type: "play.duplicate"; playId: string }
  | { type: "play.delete"; playId: string }
  | { type: "play.createFromTemplate"; templateId: string }
  | { type: "play.createBlank"; name: string; formation: string; personnel: string }
  | {
      type: "play.applyProposal";
      basePlayId: string;
      baseUpdatedAt: string;
      mode: "edit" | "variation";
      play: Play;
    }
  | { type: "playbook.replace"; playbook: PlaybookDocument };
