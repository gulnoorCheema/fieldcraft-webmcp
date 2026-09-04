import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toPng } from "html-to-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldCanvas } from "./components/FieldCanvas";
import { CoachReview } from "./components/CoachReview";
import { FooterShortcuts } from "./components/FooterShortcuts";
import { Header } from "./components/Header";
import { Inspector } from "./components/Inspector";
import { PlayRail } from "./components/PlayRail";
import { Timeline } from "./components/Timeline";
import { Toolbar } from "./components/Toolbar";
import { getSelectedPlay, persistPlaybook, useEditorStore } from "./store/editorStore";
import type { PathSegment, Point } from "./types";
import { snapPoint } from "./utils/geometry";

const isFormTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
};

export function App() {
  const state = useEditorStore();
  const canonicalPlay = getSelectedPlay(state.playbook)!;
  const play = state.agentProposal && state.proposalView === "after"
    ? state.agentProposal.previewPlay
    : canonicalPlay;
  const fieldRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const playbackStartedAt = useRef(0);
  const playbackStartTime = useRef(0);
  const reducedMotion = useReducedMotion();
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((active) => (active === message ? null : active));
    }, 2600);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => persistPlaybook(state.playbook), 240);
    return () => window.clearTimeout(timer);
  }, [state.playbook]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = window.setTimeout(() => state.setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [state.toast, state.setToast]);

  useEffect(() => {
    if (!state.agentFocus) return;
    const wait = Math.max(0, state.agentFocus.expiresAt - Date.now());
    const timer = window.setTimeout(() => state.setAgentFocus(null), wait);
    return () => window.clearTimeout(timer);
  }, [state.agentFocus, state.setAgentFocus]);

  useEffect(() => {
    if (!state.isPlaying) {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      return;
    }

    playbackStartedAt.current = performance.now();
    playbackStartTime.current = state.currentTime;
    const tick = (now: number) => {
      const elapsed = ((now - playbackStartedAt.current) / 1000) * state.speed;
      const next = playbackStartTime.current + elapsed;
      if (next >= play.duration) {
        useEditorStore.setState({ currentTime: play.duration, isPlaying: false });
        return;
      }
      useEditorStore.setState({ currentTime: next });
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [play.duration, state.isPlaying, state.speed]);

  const reflectAssignment = useCallback(() => {
    if (state.agentProposal) return;
    if (!state.selectedAssignmentId) return;
    const assignment = play.assignments.find((item) => item.id === state.selectedAssignmentId);
    const player = play.players.find((item) => item.id === assignment?.playerId);
    if (!assignment || !player) return;
    const segments: PathSegment[] = assignment.segments.map((segment) => {
      const reflect = (point: Point) => ({
        x: player.start.x + (player.start.x - point.x),
        y: point.y,
      });
      return segment.type === "line"
        ? { type: "line", to: reflect(segment.to) }
        : { type: "curve", control: reflect(segment.control), to: reflect(segment.to) };
    });
    state.dispatch({
      type: "assignment.update",
      assignmentId: assignment.id,
      patch: { segments },
    });
    showToast("Assignment reflected");
  }, [play.assignments, play.players, showToast, state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormTarget(event.target)) return;
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (state.currentTime >= play.duration) state.setCurrentTime(0);
        state.setPlaying(!state.isPlaying);
        return;
      }
      if (state.agentProposal) return;
      if ((event.key === "Backspace" || event.key === "Delete") && state.selectedPlayerIds.length) {
        event.preventDefault();
        state.selectedPlayerIds.forEach((playerId) => {
          state.dispatch({ type: "player.delete", playerId });
        });
        return;
      }
      if (event.key.toLowerCase() === "d" && !commandKey) {
        event.preventDefault();
        if (state.selectedPlayerIds.length) {
          state.dispatch({
            type: "players.duplicate",
            playerIds: state.selectedPlayerIds,
            offset: { x: 1, y: 1 },
          });
          showToast("Selection duplicated");
        } else {
          state.dispatch({ type: "play.duplicate", playId: play.id });
          showToast("Play duplicated");
        }
        return;
      }
      if (event.key.toLowerCase() === "r" && !commandKey) {
        event.preventDefault();
        reflectAssignment();
        return;
      }
      if (
        event.key === "Tab" &&
        play.players.length &&
        event.target instanceof Element &&
        event.target.closest(".field-canvas")
      ) {
        event.preventDefault();
        const current = play.players.findIndex((player) => player.id === state.selectedPlayerIds[0]);
        const next = play.players[(current + (event.shiftKey ? -1 : 1) + play.players.length) % play.players.length];
        state.selectPlayers([next.id]);
        return;
      }
      const deltaByKey: Record<string, Point> = {
        ArrowLeft: { x: -0.5, y: 0 },
        ArrowRight: { x: 0.5, y: 0 },
        ArrowUp: { x: 0, y: -0.5 },
        ArrowDown: { x: 0, y: 0.5 },
      };
      const delta = deltaByKey[event.key];
      if (delta && state.selectedPlayerIds.length) {
        event.preventDefault();
        state.selectedPlayerIds.forEach((playerId) => {
          const player = play.players.find((candidate) => candidate.id === playerId);
          if (!player) return;
          const next = event.altKey
            ? { x: player.start.x + delta.x, y: player.start.y + delta.y }
            : snapPoint({ x: player.start.x + delta.x, y: player.start.y + delta.y });
          state.dispatch({ type: "player.move", positions: { [playerId]: next } });
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [play, reflectAssignment, showToast, state]);

  const exportPng = useCallback(async () => {
    if (!fieldRef.current) return;
    setExporting(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dataUrl = await toPng(fieldRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#121a13",
      });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${play.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      anchor.click();
      showToast("2× play sheet exported");
    } catch {
      showToast("PNG export failed");
    } finally {
      setExporting(false);
    }
  }, [play.name, showToast]);

  const playMeta = useMemo(
    () => `${play.formation} · ${play.personnel}`,
    [play.formation, play.personnel],
  );

  return (
    <>
      <div className={`app-shell ${exporting ? "is-exporting" : ""}${state.agentProposal ? " is-reviewing" : ""}`}>
        <Header onExportPng={exportPng} />
        <PlayRail />
        <Toolbar />
        <main className="workspace" aria-label={`${play.name} editor`}>
          <section className="field-stage" aria-label="Tactical field">
            <div className="field-meta" aria-hidden="true">
              <span>{play.name}</span>
              <small>{playMeta}</small>
            </div>
            <FieldCanvas play={play} fieldRef={fieldRef} exporting={exporting} />
          </section>
          <section className="lower-deck">
            <Timeline play={play} />
            {state.agentProposal
              ? <CoachReview basePlay={canonicalPlay} />
              : <Inspector play={play} />}
          </section>
        </main>
        <FooterShortcuts />
        <AnimatePresence>
          {toast || state.toast ? (
            <motion.div
              className="toast"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 6, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.18 }}
              role="status"
            >
              {toast ?? state.toast}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="desktop-gate">
        <span>FIELDCRAFT / DESKTOP WORKSPACE</span>
        <h1>Bring this playbook to a larger screen.</h1>
        <p>Open Fieldcraft in a modern browser to design and review plays.</p>
      </div>
    </>
  );
}
