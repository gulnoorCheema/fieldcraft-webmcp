/// <reference types="webmcp-types" />
import { analyzePlay, type AnalysisFocus } from "../coach/analysis";
import { AGENT_PRESETS, isProposalTargetResolved } from "../coach/proposals";
import { getSelectedPlay, useEditorStore } from "../store/editorStore";
import type { AnalysisFinding, Play, Team } from "../types";

const objectSchema = (properties: object, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const pointSchema = objectSchema({
  x: { type: "number", minimum: 0, maximum: 40, description: "Yards downfield in the 40-yard window." },
  y: { type: "number", minimum: 0, maximum: 53.3, description: "Yards across the 53.3-yard field." },
}, ["x", "y"]);

const segmentSchema = {
  oneOf: [
    objectSchema({ type: { const: "line" }, to: pointSchema }, ["type", "to"]),
    objectSchema({ type: { const: "curve" }, control: pointSchema, to: pointSchema }, ["type", "control", "to"]),
  ],
};

const commonAssignmentProperties = {
  playerId: { type: "string", description: "Exact player ID from get_play players." },
  kind: { enum: ["route", "run", "block", "motion", "rush", "drop", "blitz", "man"] },
};

const changeSchema = {
  oneOf: [
    objectSchema({
      type: { const: "move_player" },
      playerId: commonAssignmentProperties.playerId,
      to: pointSchema,
    }, ["type", "playerId", "to"]),
    objectSchema({
      type: { const: "apply_preset" },
      ...commonAssignmentProperties,
      preset: { enum: AGENT_PRESETS, description: "Fieldcraft route or movement preset." },
      startTime: { type: "number", minimum: 0 },
      duration: { type: "number", minimum: 0.05 },
      depth: { type: "number", minimum: -20, maximum: 25 },
      targetPlayerId: { type: "string" },
      technique: { type: "string", maxLength: 40 },
      color: { enum: ["orange", "blue", "yellow", "coral", "bone", "olive"] },
    }, ["type", "playerId", "preset", "kind"]),
    objectSchema({
      type: { const: "set_assignment" },
      ...commonAssignmentProperties,
      segments: { type: "array", minItems: 1, maxItems: 6, items: segmentSchema },
      color: { enum: ["orange", "blue", "yellow", "coral", "bone", "olive"] },
      startTime: { type: "number", minimum: 0 },
      duration: { type: "number", minimum: 0.05 },
      targetPlayerId: { type: "string" },
      preset: { type: "string", maxLength: 30 },
      technique: { type: "string", maxLength: 40 },
    }, ["type", "playerId", "kind", "segments", "color", "startTime", "duration"]),
    objectSchema({
      type: { const: "retime_assignment" },
      playerId: commonAssignmentProperties.playerId,
      startTime: { type: "number", minimum: 0 },
      duration: { type: "number", minimum: 0.05 },
    }, ["type", "playerId"]),
    objectSchema({
      type: { const: "remove_assignment" },
      playerId: commonAssignmentProperties.playerId,
    }, ["type", "playerId"]),
    objectSchema({
      type: { const: "rename_play" },
      name: { type: "string", minLength: 1, maxLength: 60 },
    }, ["type", "name"]),
  ],
};

const requireRecord = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Input must be an object.");
  return input as Record<string, unknown>;
};

const stringInput = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  if (typeof value !== "string" || !value) throw new Error(`${key} is required.`);
  return value;
};

const getPlay = (playId: string): Play => {
  const play = useEditorStore.getState().playbook.plays.find((item) => item.id === playId);
  if (!play) throw new Error(`Play ${playId} was not found.`);
  return play;
};

const compactFinding = (finding: AnalysisFinding) => ({
  id: finding.id,
  severity: finding.severity,
  category: finding.category,
  title: finding.title,
  players: finding.playerIds,
  window: [finding.startTime, finding.endTime],
  focusTime: finding.focusTime,
  minDistance: finding.minimumDistance,
  timingMargin: finding.timingMargin,
  blockStatus: finding.blockStatus,
  evidence: finding.evidence.slice(0, 190),
});

const fitArray = <T,>(base: Record<string, unknown>, items: T[], key: string) => {
  const fitted = [...items];
  while (fitted.length > 1 && JSON.stringify({ ...base, [key]: fitted }).length > 1450) fitted.pop();
  return { ...base, [key]: fitted };
};

const sourcePlay = (play: Play, source: unknown) => {
  if (source !== "proposal") return play;
  const proposal = useEditorStore.getState().agentProposal;
  if (!proposal || proposal.basePlayId !== play.id) throw new Error("No proposal preview exists for this play.");
  return proposal.previewPlay;
};

export const createFieldcraftTools = (): WebMCP.ModelContextTool[] => [
  {
    name: "get_playbook",
    title: "Get playbook",
    description: "List Fieldcraft plays, selected play, revisions, and active coach-review status. Use before reading or changing a play.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async () => {
      const state = useEditorStore.getState();
      return {
        selectedPlayId: state.playbook.selectedPlayId,
        plays: state.playbook.plays.map((play) => ({ id: play.id, name: play.name, updatedAt: play.updatedAt })),
        proposal: state.agentProposal
          ? { id: state.agentProposal.id, mode: state.agentProposal.mode, basePlayId: state.agentProposal.basePlayId }
          : null,
      };
    },
  },
  {
    name: "get_play",
    title: "Get play section",
    description: "Read one bounded section of a current play or staged proposal. Use filters and cursor to inspect exact players or assignments.",
    inputSchema: objectSchema({
      playId: { type: "string", description: "Play ID from get_playbook." },
      section: { enum: ["summary", "players", "assignments"] },
      source: { enum: ["current", "proposal"], default: "current" },
      team: { enum: ["offense", "defense"] },
      playerIds: { type: "array", maxItems: 22, items: { type: "string" } },
      cursor: { type: "integer", minimum: 0, default: 0 },
      limit: { type: "integer", minimum: 1, maximum: 4, default: 3 },
    }, ["playId", "section"]),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (raw) => {
      const input = requireRecord(raw);
      const base = getPlay(stringInput(input, "playId"));
      const play = sourcePlay(base, input.source);
      const section = stringInput(input, "section");
      if (section === "summary") {
        return {
          id: play.id,
          name: play.name,
          formation: play.formation,
          personnel: play.personnel,
          duration: play.duration,
          updatedAt: play.updatedAt,
          playerCount: play.players.length,
          assignmentCount: play.assignments.length,
        };
      }
      const team = input.team as Team | undefined;
      const playerIds = Array.isArray(input.playerIds) ? input.playerIds.filter((id): id is string => typeof id === "string") : [];
      const cursor = typeof input.cursor === "number" ? Math.max(0, Math.floor(input.cursor)) : 0;
      const limit = typeof input.limit === "number" ? Math.max(1, Math.min(4, Math.floor(input.limit))) : 3;
      const players = play.players.filter((player) => (!team || player.team === team) && (!playerIds.length || playerIds.includes(player.id)));
      const items: unknown[] = section === "players"
        ? players.map((player) => ({ id: player.id, team: player.team, number: player.number, position: player.position, start: player.start }))
        : play.assignments
          .filter((assignment) => !playerIds.length || playerIds.includes(assignment.playerId))
          .filter((assignment) => !team || play.players.find((player) => player.id === assignment.playerId)?.team === team)
          .map((assignment) => ({
            id: assignment.id,
            playerId: assignment.playerId,
            kind: assignment.kind,
            segments: assignment.segments,
            color: assignment.color,
            startTime: assignment.startTime,
            duration: assignment.duration,
            targetPlayerId: assignment.targetPlayerId,
            preset: assignment.preset,
            technique: assignment.technique,
          }));
      const page = items.slice(cursor, cursor + limit);
      return fitArray({
        playId: play.id,
        section,
        source: input.source === "proposal" ? "proposal" : "current",
        nextCursor: cursor + page.length < items.length ? cursor + page.length : null,
      }, page, "items");
    },
  },
  {
    name: "analyze_play",
    title: "Analyze play",
    description: "Run deterministic spatial and timing checks for run, pass, protection, or all concepts. Results are risks, not outcome predictions.",
    inputSchema: objectSchema({
      playId: { type: "string", description: "Play ID from get_playbook." },
      focus: { enum: ["all", "run", "pass", "protection"], default: "all" },
      source: { enum: ["current", "proposal"], default: "current" },
      limit: { type: "integer", minimum: 1, maximum: 8, default: 8 },
    }, ["playId"]),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (raw) => {
      const input = requireRecord(raw);
      const base = getPlay(stringInput(input, "playId"));
      const play = sourcePlay(base, input.source);
      const focus = ["all", "run", "pass", "protection"].includes(String(input.focus))
        ? input.focus as AnalysisFocus
        : "all";
      const requestedLimit = typeof input.limit === "number" ? input.limit : 8;
      const findings = analyzePlay(play, focus, requestedLimit).map(compactFinding);
      return fitArray({
        playId: play.id,
        focus,
        source: input.source === "proposal" ? "proposal" : "current",
        disclaimer: "Spatial/timing risks only; not outcome predictions.",
        count: findings.length,
      }, findings, "findings");
    },
  },
  {
    name: "focus_finding",
    title: "Focus finding",
    description: "Recompute one finding, scrub to its worst moment, select the involved players, and show a temporary field overlay. Does not edit the play.",
    inputSchema: objectSchema({
      playId: { type: "string" },
      findingId: { type: "string" },
    }, ["playId", "findingId"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (raw) => {
      const input = requireRecord(raw);
      const play = getPlay(stringInput(input, "playId"));
      const findingId = stringInput(input, "findingId");
      const finding = analyzePlay(play).find((item) => item.id === findingId);
      if (!finding) throw new Error("That finding is stale. Run analyze_play again.");
      useEditorStore.getState().setAgentFocus({
        findingId: finding.id,
        playId: play.id,
        playerIds: finding.playerIds,
        time: finding.focusTime,
        title: finding.title,
        evidence: finding.evidence,
        severity: finding.severity,
        expiresAt: Date.now() + 9000,
      });
      return { focused: true, ...compactFinding(finding) };
    },
  },
  {
    name: "stage_play_changes",
    title: "Stage play changes",
    description: "Validate up to 12 edits and open a reversible Before/After coach review. This never changes the saved playbook; variations preview a renamed duplicate.",
    inputSchema: objectSchema({
      basePlayId: { type: "string", description: "Exact base play ID." },
      baseUpdatedAt: { type: "string", description: "Exact revision from get_playbook or get_play." },
      mode: { enum: ["edit", "variation"] },
      name: { type: "string", maxLength: 60, description: "Required new name for variation mode." },
      rationale: { type: "string", minLength: 1, maxLength: 500 },
      targetFindingId: { type: "string", description: "Optional finding this proposal repairs." },
      changes: { type: "array", minItems: 1, maxItems: 12, items: changeSchema },
    }, ["basePlayId", "baseUpdatedAt", "mode", "rationale", "changes"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (raw) => {
      const proposal = useEditorStore.getState().stageAgentProposal(raw);
      const before = proposal.beforeFindings.filter((finding) => finding.severity !== "note").length;
      const after = proposal.afterFindings.filter((finding) => finding.severity !== "note").length;
      return {
        staged: true,
        proposalId: proposal.id,
        mode: proposal.mode,
        previewName: proposal.name,
        changeCount: proposal.changes.length,
        riskCount: { before, after },
        targetResolved: isProposalTargetResolved(proposal) ?? null,
        savedPlaybookChanged: false,
        requiresCoachConfirmation: true,
      };
    },
  },
  {
    name: "commit_play_changes",
    title: "Commit play changes",
    description: "Apply the active reviewed proposal atomically. Invoke only after the coach explicitly confirms the visible Before/After proposal; never infer confirmation.",
    inputSchema: objectSchema({
      proposalId: { type: "string", description: "Active proposal ID returned by stage_play_changes." },
    }, ["proposalId"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (raw) => {
      const input = requireRecord(raw);
      const proposalId = stringInput(input, "proposalId");
      const mode = useEditorStore.getState().agentProposal?.mode;
      const play = useEditorStore.getState().commitAgentProposal(proposalId);
      return {
        committed: true,
        proposalId,
        mode,
        play: { id: play.id, name: play.name, updatedAt: play.updatedAt },
        undoable: true,
      };
    },
  },
  {
    name: "discard_play_changes",
    title: "Discard play changes",
    description: "Discard the active staged coach review without changing the saved playbook.",
    inputSchema: objectSchema({
      proposalId: { type: "string", description: "Active proposal ID returned by stage_play_changes." },
    }, ["proposalId"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (raw) => {
      const input = requireRecord(raw);
      const proposalId = stringInput(input, "proposalId");
      const active = useEditorStore.getState().agentProposal;
      if (!active || active.id !== proposalId) throw new Error("That proposal is not active.");
      useEditorStore.getState().discardAgentProposal();
      return { discarded: true, proposalId, savedPlaybookChanged: false };
    },
  },
];

export const registerFieldcraftTools = (context = document.modelContext) => {
  const controller = new AbortController();
  const store = useEditorStore.getState();
  if (!context?.registerTool) {
    store.setWebMcpStatus("unsupported");
    return () => controller.abort();
  }
  store.setWebMcpStatus("registering");
  try {
    Promise.all(
      createFieldcraftTools().map((tool) => context.registerTool(tool, { signal: controller.signal })),
    ).then(
      () => useEditorStore.getState().setWebMcpStatus("ready"),
      () => useEditorStore.getState().setWebMcpStatus("error"),
    );
  } catch {
    store.setWebMcpStatus("error");
  }
  return () => controller.abort();
};

export const getCurrentPlayForTools = () => getSelectedPlay(useEditorStore.getState().playbook);
