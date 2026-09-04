import { create } from "zustand";
import { buildAgentProposal } from "../coach/proposals";
import { PLAY_TEMPLATES, makeBlankPlay, makeInitialPlaybook } from "../data/templates";
import type {
  AgentFocus,
  AgentProposal,
  Assignment,
  EditorCommand,
  EditorTool,
  Play,
  PlaybookDocument,
  StagePlayChangesInput,
} from "../types";

const STORAGE_KEY = "fieldcraft-playbook-v1";
const MAX_HISTORY = 50;

const deepClone = <T,>(value: T): T => structuredClone(value);

const upgradeSeededCoachScenario = (document: PlaybookDocument) => {
  const next = deepClone(document);
  const counter = next.plays.find((play) => play.id === "pistol-counter");
  const assignment = counter?.assignments.find((item) => item.playerId === "d-olb-r");
  const oldEnd = assignment?.segments.at(-1)?.to;
  if (
    counter && assignment && assignment.preset === "hook"
    && assignment.startTime === 0.2 && assignment.duration === 1.8
    && oldEnd?.x === 28 && oldEnd.y === 31.5
  ) {
    const seeded = PLAY_TEMPLATES.find((play) => play.id === "pistol-counter")
      ?.assignments.find((item) => item.playerId === "d-olb-r");
    if (seeded) {
      Object.assign(assignment, deepClone(seeded));
      counter.updatedAt = new Date().toISOString();
    }
  }
  return next;
};

export const isPlaybookDocument = (value: unknown): value is PlaybookDocument => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PlaybookDocument>;
  if (
    item.schemaVersion !== 1 ||
    typeof item.selectedPlayId !== "string" ||
    !Array.isArray(item.plays) ||
    item.plays.length === 0
  ) {
    return false;
  }
  const kinds = new Set(["route", "run", "block", "motion", "rush", "drop", "blitz", "man"]);
  const validPoint = (point: unknown) => {
    if (!point || typeof point !== "object") return false;
    const candidate = point as { x?: unknown; y?: unknown };
    return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
  };
  const validPlays = item.plays.every((play) => {
    if (
      !play ||
      typeof play.id !== "string" ||
      typeof play.name !== "string" ||
      typeof play.formation !== "string" ||
      typeof play.personnel !== "string" ||
      !Number.isFinite(play.duration) ||
      play.duration <= 0 ||
      typeof play.updatedAt !== "string" ||
      !Array.isArray(play.players) ||
      !Array.isArray(play.assignments)
    ) {
      return false;
    }
    const playerIds = new Set(play.players.map((player) => player?.id));
    return (
      playerIds.size === play.players.length &&
      play.players.every(
        (player) =>
          typeof player.id === "string" &&
          (player.team === "offense" || player.team === "defense") &&
          Number.isFinite(player.number) &&
          typeof player.position === "string" &&
          validPoint(player.start),
      ) &&
      play.assignments.every(
        (assignment) =>
          typeof assignment.id === "string" &&
          typeof assignment.playerId === "string" &&
          playerIds.has(assignment.playerId) &&
          kinds.has(assignment.kind) &&
          typeof assignment.color === "string" &&
          Array.isArray(assignment.segments) &&
          assignment.segments.length > 0 &&
          assignment.segments.every(
            (segment) =>
              segment &&
              (segment.type === "line" || segment.type === "curve") &&
              validPoint(segment.to) &&
              (segment.type !== "curve" || validPoint(segment.control)),
          ) &&
          Number.isFinite(assignment.startTime) &&
          assignment.startTime >= 0 &&
          Number.isFinite(assignment.duration) &&
          assignment.duration > 0 &&
          (assignment.targetPlayerId === undefined || playerIds.has(assignment.targetPlayerId)),
      )
    );
  });
  return validPlays && item.plays.some((play) => play.id === item.selectedPlayId);
};

const loadInitialPlaybook = (): PlaybookDocument => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return makeInitialPlaybook();
    const parsed: unknown = JSON.parse(stored);
    return isPlaybookDocument(parsed) ? upgradeSeededCoachScenario(parsed) : makeInitialPlaybook();
  } catch {
    return makeInitialPlaybook();
  }
};

const selectedPlay = (playbook: PlaybookDocument) =>
  playbook.plays.find((play) => play.id === playbook.selectedPlayId) ?? playbook.plays[0];

const updateCurrentPlay = (
  playbook: PlaybookDocument,
  update: (play: Play) => void,
): PlaybookDocument => {
  const next = deepClone(playbook);
  const play = selectedPlay(next);
  if (play) {
    update(play);
    play.updatedAt = new Date().toISOString();
  }
  return next;
};

export type WebMcpStatus = "unsupported" | "registering" | "ready" | "error";

export type EditorState = {
  playbook: PlaybookDocument;
  selectedPlayerIds: string[];
  selectedAssignmentId: string | null;
  activeTool: EditorTool;
  currentTime: number;
  speed: number;
  isPlaying: boolean;
  gridEnabled: boolean;
  measureEnabled: boolean;
  history: PlaybookDocument[];
  future: PlaybookDocument[];
  gestureBase: PlaybookDocument | null;
  toast: string | null;
  webMcpStatus: WebMcpStatus;
  agentFocus: AgentFocus | null;
  agentProposal: AgentProposal | null;
  proposalView: "before" | "after";
  dispatch: (command: EditorCommand, options?: { transient?: boolean }) => void;
  selectPlayers: (playerIds: string[], additive?: boolean) => void;
  selectAssignment: (assignmentId: string | null) => void;
  setTool: (tool: EditorTool) => void;
  setCurrentTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleGrid: () => void;
  toggleMeasure: () => void;
  beginGesture: () => void;
  commitGesture: () => void;
  undo: () => void;
  redo: () => void;
  setToast: (toast: string | null) => void;
  setWebMcpStatus: (status: WebMcpStatus) => void;
  setAgentFocus: (focus: AgentFocus | null) => void;
  stageAgentProposal: (input: StagePlayChangesInput | unknown) => AgentProposal;
  setProposalView: (view: "before" | "after") => void;
  commitAgentProposal: (proposalId?: string) => Play;
  discardAgentProposal: () => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  playbook: loadInitialPlaybook(),
  selectedPlayerIds: ["o-rg"],
  selectedAssignmentId: "a-rg",
  activeTool: "select",
  currentTime: 1.4,
  speed: 1,
  isPlaying: false,
  gridEnabled: true,
  measureEnabled: true,
  history: [],
  future: [],
  gestureBase: null,
  toast: null,
  webMcpStatus: "unsupported",
  agentFocus: null,
  agentProposal: null,
  proposalView: "after",

  dispatch: (command, options) => {
    const state = get();
    if (state.agentProposal && command.type !== "play.applyProposal") {
      set({ toast: "Finish or discard the coach review first." });
      return;
    }
    if (command.type === "play.select") {
      const play = state.playbook.plays.find((item) => item.id === command.playId);
      if (!play) return;
      set({
        playbook: { ...state.playbook, selectedPlayId: command.playId },
        selectedPlayerIds: [],
        selectedAssignmentId: null,
        currentTime: Math.min(1.4, play.duration),
        isPlaying: false,
      });
      return;
    }

    const before = state.playbook;
    let next = before;
    if (command.type === "player.move") {
      next = updateCurrentPlay(before, (play) => {
        for (const player of play.players) {
          const position = command.positions[player.id];
          if (!position) continue;
          const delta = { x: position.x - player.start.x, y: position.y - player.start.y };
          player.start = position;
          play.assignments
            .filter((assignment) => assignment.playerId === player.id)
            .forEach((assignment) => {
              assignment.segments = assignment.segments.map((segment) =>
                segment.type === "line"
                  ? { ...segment, to: { x: segment.to.x + delta.x, y: segment.to.y + delta.y } }
                  : {
                      ...segment,
                      control: {
                        x: segment.control.x + delta.x,
                        y: segment.control.y + delta.y,
                      },
                      to: { x: segment.to.x + delta.x, y: segment.to.y + delta.y },
                    },
              );
            });
        }
      });
    }
    if (command.type === "player.update") {
      next = updateCurrentPlay(before, (play) => {
        const player = play.players.find((item) => item.id === command.playerId);
        if (player) Object.assign(player, command.patch);
      });
    }
    if (command.type === "player.delete") {
      next = updateCurrentPlay(before, (play) => {
        play.players = play.players.filter((item) => item.id !== command.playerId);
        play.assignments = play.assignments.filter((item) => item.playerId !== command.playerId);
      });
    }
    if (command.type === "players.duplicate") {
      next = updateCurrentPlay(before, (play) => {
        const createdIds: string[] = [];
        command.playerIds.forEach((playerId, index) => {
          const player = play.players.find((item) => item.id === playerId);
          if (!player) return;
          const suffix = `${Date.now()}-${index}`;
          const copy = {
            ...deepClone(player),
            id: `${player.id}-copy-${suffix}`,
            start: {
              x: Math.min(39.5, player.start.x + command.offset.x),
              y: Math.min(52.8, player.start.y + command.offset.y),
            },
          };
          play.players.push(copy);
          createdIds.push(copy.id);
          play.assignments
            .filter((assignment) => assignment.playerId === playerId)
            .forEach((assignment) => {
              const shifted = deepClone(assignment);
              shifted.id = `${assignment.id}-copy-${suffix}`;
              shifted.playerId = copy.id;
              shifted.segments = shifted.segments.map((segment) =>
                segment.type === "line"
                  ? {
                      ...segment,
                      to: {
                        x: segment.to.x + command.offset.x,
                        y: segment.to.y + command.offset.y,
                      },
                    }
                  : {
                      ...segment,
                      control: {
                        x: segment.control.x + command.offset.x,
                        y: segment.control.y + command.offset.y,
                      },
                      to: {
                        x: segment.to.x + command.offset.x,
                        y: segment.to.y + command.offset.y,
                      },
                    },
              );
              play.assignments.push(shifted);
            });
        });
        queueMicrotask(() => set({ selectedPlayerIds: createdIds }));
      });
    }
    if (command.type === "assignment.upsert") {
      next = updateCurrentPlay(before, (play) => {
        play.assignments = play.assignments.filter(
          (item) => item.playerId !== command.assignment.playerId,
        );
        play.assignments.push(command.assignment);
      });
    }
    if (command.type === "assignment.update") {
      next = updateCurrentPlay(before, (play) => {
        const assignment = play.assignments.find((item) => item.id === command.assignmentId);
        if (assignment) Object.assign(assignment, command.patch);
      });
    }
    if (command.type === "assignment.delete") {
      next = updateCurrentPlay(before, (play) => {
        play.assignments = play.assignments.filter((item) => item.id !== command.assignmentId);
      });
    }
    if (command.type === "play.rename") {
      next = deepClone(before);
      const play = next.plays.find((item) => item.id === command.playId);
      if (play) {
        play.name = command.name || "Untitled Play";
        play.updatedAt = new Date().toISOString();
      }
    }
    if (command.type === "play.duplicate") {
      next = deepClone(before);
      const source = next.plays.find((item) => item.id === command.playId);
      if (source) {
        const copy = deepClone(source);
        copy.id = `${source.id}-copy-${Date.now()}`;
        copy.name = `${source.name} Copy`;
        copy.updatedAt = new Date().toISOString();
        next.plays.push(copy);
        next.selectedPlayId = copy.id;
      }
    }
    if (command.type === "play.delete") {
      if (before.plays.length <= 1) {
        set({ toast: "Keep at least one play in the install." });
        return;
      }
      next = deepClone(before);
      const index = next.plays.findIndex((item) => item.id === command.playId);
      next.plays = next.plays.filter((item) => item.id !== command.playId);
      next.selectedPlayId = next.plays[Math.max(0, index - 1)]?.id ?? next.plays[0].id;
    }
    if (command.type === "play.createFromTemplate") {
      next = deepClone(before);
      const template = PLAY_TEMPLATES.find((item) => item.id === command.templateId);
      if (template) {
        const play = deepClone(template);
        play.id = `${template.id}-${Date.now()}`;
        play.name = `${template.name} Variation`;
        play.updatedAt = new Date().toISOString();
        next.plays.push(play);
        next.selectedPlayId = play.id;
      }
    }
    if (command.type === "play.createBlank") {
      next = deepClone(before);
      const play = makeBlankPlay(command.name, command.formation, command.personnel);
      next.plays.push(play);
      next.selectedPlayId = play.id;
    }
    if (command.type === "play.applyProposal") {
      const base = before.plays.find((play) => play.id === command.basePlayId);
      if (!base || base.updatedAt !== command.baseUpdatedAt) {
        set({ toast: "This play changed. Discard the stale review and run it again." });
        return;
      }
      next = deepClone(before);
      const committed = deepClone(command.play);
      committed.updatedAt = new Date().toISOString();
      if (command.mode === "variation") {
        committed.id = `${command.basePlayId}-coach-${Date.now()}`;
        next.plays.push(committed);
      } else {
        committed.id = command.basePlayId;
        const index = next.plays.findIndex((play) => play.id === command.basePlayId);
        next.plays[index] = committed;
      }
      next.selectedPlayId = committed.id;
    }
    if (command.type === "playbook.replace") {
      next = deepClone(command.playbook);
    }

    if (next === before) return;
    const history = options?.transient
      ? state.history
      : [...state.history, deepClone(before)].slice(-MAX_HISTORY);
    set({
      playbook: next,
      history,
      future: options?.transient ? state.future : [],
      isPlaying: false,
    });
  },

  selectPlayers: (playerIds, additive = false) => {
    const state = get();
    const next = additive
      ? Array.from(new Set([...state.selectedPlayerIds, ...playerIds]))
      : playerIds;
    const play = selectedPlay(state.playbook);
    const assignment = play?.assignments.find((item) => item.playerId === next.at(-1));
    set({ selectedPlayerIds: next, selectedAssignmentId: assignment?.id ?? null });
  },
  selectAssignment: (assignmentId) => {
    const play = selectedPlay(get().playbook);
    const assignment = play?.assignments.find((item) => item.id === assignmentId);
    set({
      selectedAssignmentId: assignmentId,
      selectedPlayerIds: assignment ? [assignment.playerId] : [],
    });
  },
  setTool: (activeTool) => set({ activeTool }),
  setCurrentTime: (currentTime) => set({ currentTime, isPlaying: false }),
  setSpeed: (speed) => set({ speed }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  toggleGrid: () => set((state) => ({ gridEnabled: !state.gridEnabled })),
  toggleMeasure: () => set((state) => ({ measureEnabled: !state.measureEnabled })),
  beginGesture: () => {
    const state = get();
    if (state.agentProposal) return;
    set({ gestureBase: deepClone(state.playbook) });
  },
  commitGesture: () => {
    const state = get();
    if (!state.gestureBase) return;
    set({
      history: [...state.history, state.gestureBase].slice(-MAX_HISTORY),
      future: [],
      gestureBase: null,
    });
  },
  undo: () => {
    const state = get();
    if (state.agentProposal) return;
    const previous = state.history.at(-1);
    if (!previous) return;
    set({
      playbook: deepClone(previous),
      history: state.history.slice(0, -1),
      future: [deepClone(state.playbook), ...state.future].slice(0, MAX_HISTORY),
      isPlaying: false,
    });
  },
  redo: () => {
    const state = get();
    if (state.agentProposal) return;
    const next = state.future[0];
    if (!next) return;
    set({
      playbook: deepClone(next),
      history: [...state.history, deepClone(state.playbook)].slice(-MAX_HISTORY),
      future: state.future.slice(1),
      isPlaying: false,
    });
  },
  setToast: (toast) => set({ toast }),
  setWebMcpStatus: (webMcpStatus) => set({ webMcpStatus }),
  setAgentFocus: (agentFocus) => {
    if (!agentFocus) {
      set({ agentFocus: null });
      return;
    }
    const state = get();
    const play = state.playbook.plays.find((item) => item.id === agentFocus.playId);
    if (!play) throw new Error("The focused play is no longer available.");
    const selectedAssignment = play.assignments.find(
      (assignment) => assignment.playerId === agentFocus.playerIds.at(-1),
    );
    set({
      playbook: { ...state.playbook, selectedPlayId: play.id },
      agentFocus,
      currentTime: Math.min(play.duration, Math.max(0, agentFocus.time)),
      selectedPlayerIds: agentFocus.playerIds,
      selectedAssignmentId: selectedAssignment?.id ?? null,
      isPlaying: false,
    });
  },
  stageAgentProposal: (input) => {
    const state = get();
    if (state.agentProposal) throw new Error("A coach review is already active.");
    const basePlayId = (input as { basePlayId?: unknown } | null)?.basePlayId;
    const play = typeof basePlayId === "string"
      ? state.playbook.plays.find((item) => item.id === basePlayId)
      : undefined;
    if (!play) throw new Error("The base play does not exist.");
    const proposal = buildAgentProposal(play, input);
    set({
      agentProposal: proposal,
      proposalView: "after",
      playbook: { ...state.playbook, selectedPlayId: play.id },
      selectedPlayerIds: [],
      selectedAssignmentId: null,
      currentTime: proposal.beforeFindings.find(
        (finding) => finding.id === proposal.targetFindingId,
      )?.focusTime ?? state.currentTime,
      isPlaying: false,
      toast: "Coach change staged for review.",
    });
    return proposal;
  },
  setProposalView: (proposalView) => set({ proposalView, isPlaying: false }),
  commitAgentProposal: (proposalId) => {
    const state = get();
    const proposal = state.agentProposal;
    if (!proposal) throw new Error("There is no active coach review.");
    if (proposalId && proposal.id !== proposalId) throw new Error("The proposal ID is stale.");
    const base = state.playbook.plays.find((play) => play.id === proposal.basePlayId);
    if (!base || base.updatedAt !== proposal.baseUpdatedAt) {
      throw new Error("The play changed after this proposal was staged.");
    }
    state.dispatch({
      type: "play.applyProposal",
      basePlayId: proposal.basePlayId,
      baseUpdatedAt: proposal.baseUpdatedAt,
      mode: proposal.mode,
      play: proposal.previewPlay,
    });
    const committedState = get();
    const committed = selectedPlay(committedState.playbook);
    set({
      agentProposal: null,
      agentFocus: null,
      proposalView: "after",
      selectedPlayerIds: [],
      selectedAssignmentId: null,
      toast: proposal.mode === "variation" ? "Variation added to the playbook." : "Coach changes applied.",
    });
    return committed;
  },
  discardAgentProposal: () => set({
    agentProposal: null,
    agentFocus: null,
    proposalView: "after",
    isPlaying: false,
    toast: "Coach review discarded. The play was not changed.",
  }),
}));

export const dispatchEditorCommand = (
  command: EditorCommand,
  options?: { transient?: boolean },
) => useEditorStore.getState().dispatch(command, options);

export const persistPlaybook = (playbook: PlaybookDocument) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playbook));
};

export const getSelectedPlay = (playbook: PlaybookDocument) => selectedPlay(playbook);

export const getSelectedAssignment = (
  play: Play | undefined,
  assignmentId: string | null,
): Assignment | undefined => play?.assignments.find((item) => item.id === assignmentId);
