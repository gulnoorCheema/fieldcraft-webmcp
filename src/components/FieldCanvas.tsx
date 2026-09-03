import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { COLORS } from "../data/templates";
import { useEditorStore } from "../store/editorStore";
import type { Assignment, PathSegment, Play, Point } from "../types";
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  SVG_HEIGHT,
  SVG_WIDTH,
  assignmentPointAtProgress,
  assignmentProgressAtTime,
  assignmentToSvgPath,
  fieldToSvg,
  pathLengthYards,
  playerPositionAtTime,
  resolveMarkerCollisions,
  snapPoint,
  svgToField,
} from "../utils/geometry";

type FieldCanvasProps = {
  play: Play;
  exporting?: boolean;
  fieldRef: RefObject<HTMLDivElement | null>;
};

type DragState =
  | {
      kind: "players";
      pointerId: number;
      origin: Point;
      starts: Record<string, Point>;
    }
  | {
      kind: "handle";
      pointerId: number;
      assignmentId: string;
      segmentIndex: number;
      pointKind: "to" | "control";
      segments: PathSegment[];
    };

const markerId = (color: string) => {
  if (color === COLORS.orange) return "arrow-orange";
  if (color === COLORS.blue) return "arrow-blue";
  if (color === COLORS.yellow) return "arrow-yellow";
  if (color === COLORS.coral) return "arrow-coral";
  return "arrow-bone";
};

const ToolMarker = ({ id, color }: { id: string; color: string }) => (
  <marker
    id={id}
    viewBox="0 0 10 10"
    refX="8"
    refY="5"
    markerWidth="5"
    markerHeight="5"
    orient="auto-start-reverse"
  >
    <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
  </marker>
);

const isDashed = (assignment: Assignment) =>
  assignment.kind === "motion" || assignment.kind === "drop" || assignment.kind === "man";

export function FieldCanvas({ play, exporting = false, fieldRef }: FieldCanvasProps) {
  const reducedMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(SVG_WIDTH);
  const {
    activeTool,
    agentFocus,
    agentProposal,
    currentTime,
    gridEnabled,
    isPlaying,
    measureEnabled,
    selectedAssignmentId,
    selectedPlayerIds,
    beginGesture,
    commitGesture,
    dispatch,
    selectAssignment,
    selectPlayers,
    setToast,
  } = useEditorStore();

  const assignmentByPlayer = useMemo(
    () => new Map(play.assignments.map((assignment) => [assignment.playerId, assignment])),
    [play.assignments],
  );

  useEffect(() => {
    const surface = svgRef.current;
    if (!surface) return;

    const syncCoordinateSpace = () => {
      const bounds = surface.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      const nextWidth = Math.round((SVG_HEIGHT * bounds.width) / bounds.height);
      setSurfaceWidth((current) => current === nextWidth ? current : nextWidth);
    };

    syncCoordinateSpace();
    const observer = new ResizeObserver(syncCoordinateSpace);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const pointerToField = (event: React.PointerEvent<SVGSVGElement | SVGElement>): Point => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return svgToField({
      x: ((event.clientX - bounds.left) / bounds.width) * surfaceWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * SVG_HEIGHT,
    }, surfaceWidth);
  };

  const onPlayerPointerDown = (event: React.PointerEvent<SVGGElement>, playerId: string) => {
    event.stopPropagation();
    if (isPlaying || agentProposal) return;
    if (activeTool === "erase") {
      dispatch({ type: "player.delete", playerId });
      selectPlayers([]);
      setToast("Player removed");
      return;
    }

    const alreadySelected = selectedPlayerIds.includes(playerId);
    const nextSelection = event.shiftKey
      ? alreadySelected
        ? selectedPlayerIds.filter((id) => id !== playerId)
        : [...selectedPlayerIds, playerId]
      : alreadySelected
        ? selectedPlayerIds
        : [playerId];
    selectPlayers(nextSelection);
    const dragIds = nextSelection.length ? nextSelection : [playerId];
    const starts = Object.fromEntries(
      play.players
        .filter((player) => dragIds.includes(player.id))
        .map((player) => [player.id, { ...player.start }]),
    );
    beginGesture();
    dragRef.current = {
      kind: "players",
      pointerId: event.pointerId,
      origin: pointerToField(event),
      starts,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onHandlePointerDown = (
    event: React.PointerEvent<SVGCircleElement>,
    assignment: Assignment,
    segmentIndex: number,
    pointKind: "to" | "control",
  ) => {
    event.stopPropagation();
    if (isPlaying || agentProposal) return;
    beginGesture();
    dragRef.current = {
      kind: "handle",
      pointerId: event.pointerId,
      assignmentId: assignment.id,
      segmentIndex,
      pointKind,
      segments: structuredClone(assignment.segments),
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const raw = pointerToField(event);
    const snapped = snapPoint(raw, gridEnabled && !event.altKey);

    if (drag.kind === "players") {
      const dx = snapped.x - drag.origin.x;
      const dy = snapped.y - drag.origin.y;
      const positions = Object.fromEntries(
        Object.entries(drag.starts).map(([id, start]) => [
          id,
          snapPoint(
            {
              x: Math.max(0.5, Math.min(FIELD_LENGTH - 0.5, start.x + dx)),
              y: Math.max(0.5, Math.min(FIELD_WIDTH - 0.5, start.y + dy)),
            },
            gridEnabled && !event.altKey,
          ),
        ]),
      );
      dispatch({ type: "player.move", positions }, { transient: true });
      return;
    }

    const segments = structuredClone(drag.segments);
    const segment = segments[drag.segmentIndex];
    if (!segment) return;
    if (drag.pointKind === "to") segment.to = snapped;
    if (drag.pointKind === "control" && segment.type === "curve") segment.control = snapped;
    dispatch(
      { type: "assignment.update", assignmentId: drag.assignmentId, patch: { segments } },
      { transient: true },
    );
  };

  const finishDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    svgRef.current?.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    commitGesture();
  };

  const selectPath = (event: React.PointerEvent<SVGPathElement>, assignment: Assignment) => {
    event.stopPropagation();
    if (agentProposal) return;
    if (activeTool === "erase") {
      dispatch({ type: "assignment.delete", assignmentId: assignment.id });
      selectAssignment(null);
      setToast("Assignment cleared");
      return;
    }
    selectAssignment(assignment.id);
  };

  const selectedAssignment = play.assignments.find(
    (assignment) => assignment.id === selectedAssignmentId,
  );
  const selectedPlayer = selectedAssignment
    ? play.players.find((player) => player.id === selectedAssignment.playerId)
    : undefined;

  const markerLayout = useMemo(() => {
    const markers = play.players.map((player) => ({
      id: player.id,
      team: player.team,
      point: fieldToSvg(playerPositionAtTime(play, player.id, currentTime), surfaceWidth),
      priority: selectedPlayerIds.includes(player.id)
        ? 2
        : assignmentByPlayer.get(player.id)?.kind === "run" ? 1 : 0,
    }));
    const resolved = resolveMarkerCollisions(markers);
    return new Map(markers.map((marker) => [
      marker.id,
      { canonical: marker.point, display: resolved.get(marker.id) ?? marker.point },
    ]));
  }, [assignmentByPlayer, currentTime, play, selectedPlayerIds, surfaceWidth]);

  const renderPlayers = useMemo(
    () => [...play.players].sort((a, b) => {
      const aPriority = selectedPlayerIds.includes(a.id)
        ? 2
        : assignmentByPlayer.get(a.id)?.kind === "run" ? 1 : 0;
      const bPriority = selectedPlayerIds.includes(b.id)
        ? 2
        : assignmentByPlayer.get(b.id)?.kind === "run" ? 1 : 0;
      return aPriority - bPriority;
    }),
    [assignmentByPlayer, play.players, selectedPlayerIds],
  );

  return (
    <div
      ref={fieldRef}
      className={`field-canvas${exporting ? " is-exporting" : ""}`}
      data-testid="field-canvas"
      data-play-name={play.name}
    >
      <svg
        ref={svgRef}
        className={`field-svg tool-${activeTool}`}
        viewBox={`0 0 ${surfaceWidth} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        role="application"
        aria-label={`${play.name} football play editor`}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            selectPlayers([]);
            selectAssignment(null);
          }
        }}
      >
        <defs>
          <ToolMarker id="arrow-orange" color={COLORS.orange} />
          <ToolMarker id="arrow-blue" color={COLORS.blue} />
          <ToolMarker id="arrow-yellow" color={COLORS.yellow} />
          <ToolMarker id="arrow-coral" color={COLORS.coral} />
          <ToolMarker id="arrow-bone" color={COLORS.bone} />
        </defs>

        <rect
          className="field-hit-area"
          width={surfaceWidth}
          height={SVG_HEIGHT}
          onPointerDown={() => {
            selectPlayers([]);
            selectAssignment(null);
          }}
        />

        <g className="field-lines" aria-hidden="true">
          {[3, 8.7, 14.4, 20, 25.7, 31.4, 37].map((yard, index) => {
            const x = (yard / FIELD_LENGTH) * surfaceWidth;
            const labels = [20, 30, 40, 50, 40, 30, 20];
            return (
              <g key={yard}>
                <line x1={x} y1="0" x2={x} y2={SVG_HEIGHT} />
                <text x={x + 7} y="92" transform={`rotate(90 ${x + 7} 92)`}>
                  {labels[index]}
                </text>
                <line className="hash" x1={x - 3} y1="170" x2={x + 3} y2="170" />
                <line className="hash" x1={x - 3} y1="330" x2={x + 3} y2="330" />
              </g>
            );
          })}
          <line className="line-of-scrimmage" x1={surfaceWidth * 0.445} y1="0" x2={surfaceWidth * 0.445} y2={SVG_HEIGHT} />
          <line className="line-to-gain" x1={surfaceWidth * 0.64} y1="0" x2={surfaceWidth * 0.64} y2={SVG_HEIGHT} />
        </g>

        <g className="assignment-layer">
          {play.assignments.map((assignment) => {
            const player = play.players.find((item) => item.id === assignment.playerId);
            if (!player) return null;
            const selected = assignment.id === selectedAssignmentId;
            const progress = assignmentProgressAtTime(assignment, currentTime);
            const trailDots = Array.from({ length: 7 }, (_, index) => (progress * index) / 6).filter(
              (value) => value > 0,
            );
            return (
              <g key={assignment.id} className={selected ? "is-selected" : undefined}>
                {!exporting && currentTime > 0 &&
                  trailDots.map((value, index) => {
                    const point = fieldToSvg(
                      assignmentPointAtProgress(player.start, assignment, value),
                      surfaceWidth,
                    );
                    return (
                      <circle
                        key={`${assignment.id}-trail-${index}`}
                        className="motion-trail-dot"
                        cx={point.x}
                        cy={point.y}
                        r={2.2 + index * 0.15}
                        fill={assignment.color}
                        opacity={0.08 + index * 0.07}
                      />
                    );
                  })}
                <motion.path
                  className={`assignment-path${selected ? " selected" : ""}`}
                  d={assignmentToSvgPath(player.start, assignment, surfaceWidth)}
                  stroke={assignment.color}
                  strokeDasharray={isDashed(assignment) ? "8 7" : undefined}
                  markerEnd={`url(#${markerId(assignment.color)})`}
                  initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: selected ? 1 : 0.9 }}
                  transition={{ duration: reducedMotion ? 0 : 0.35, ease: "easeOut" }}
                  onPointerDown={(event) => selectPath(event, assignment)}
                />
              </g>
            );
          })}
        </g>

        {!exporting && !agentProposal && selectedAssignment && selectedPlayer && (
          <g className="handle-layer" aria-label="Selected assignment path handles">
            {selectedAssignment.segments.map((segment, index) => {
              const previous =
                index === 0 ? selectedPlayer.start : selectedAssignment.segments[index - 1].to;
              const previousSvg = fieldToSvg(previous, surfaceWidth);
              const to = fieldToSvg(segment.to, surfaceWidth);
              const control = segment.type === "curve" ? fieldToSvg(segment.control, surfaceWidth) : null;
              return (
                <g key={`handle-${index}`}>
                  {control && (
                    <>
                      <line
                        className="control-line"
                        x1={previousSvg.x}
                        y1={previousSvg.y}
                        x2={control.x}
                        y2={control.y}
                      />
                      <line
                        className="control-line"
                        x1={control.x}
                        y1={control.y}
                        x2={to.x}
                        y2={to.y}
                      />
                      <circle
                        className="path-handle control"
                        cx={control.x}
                        cy={control.y}
                        r="5"
                        onPointerDown={(event) =>
                          onHandlePointerDown(event, selectedAssignment, index, "control")
                        }
                      />
                    </>
                  )}
                  <circle
                    className="path-handle"
                    cx={to.x}
                    cy={to.y}
                    r="6"
                    onPointerDown={(event) =>
                      onHandlePointerDown(event, selectedAssignment, index, "to")
                    }
                  />
                </g>
              );
            })}
            {measureEnabled && selectedAssignment.segments.length > 0 && (() => {
              const end = fieldToSvg(selectedAssignment.segments.at(-1)!.to, surfaceWidth);
              const length = pathLengthYards(selectedPlayer.start, selectedAssignment);
              return (
                <g className="path-measure" transform={`translate(${end.x + 12} ${end.y - 12})`}>
                  <rect x="0" y="-15" width="58" height="22" rx="2" />
                  <text x="8" y="0">{length.toFixed(1)} YDS</text>
                </g>
              );
            })()}
          </g>
        )}

        {!exporting && agentFocus?.playId === play.id && (
          <g className={`agent-focus-layer ${agentFocus.severity}`} aria-label={agentFocus.title}>
            {agentFocus.playerIds.map((playerId, index) => {
              const layout = markerLayout.get(playerId);
              if (!layout) return null;
              return (
                <g key={`focus-${playerId}`}>
                  <motion.circle
                    className="danger-ring"
                    cx={layout.display.x}
                    cy={layout.display.y}
                    r={24 + index * 2}
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.72 }}
                    animate={{ opacity: [0.3, 0.82, 0.3], scale: [0.9, 1.05, 0.9] }}
                    transition={{ duration: reducedMotion ? 0 : 1.6, repeat: reducedMotion ? 0 : Infinity }}
                  />
                </g>
              );
            })}
            {(() => {
              const points = agentFocus.playerIds
                .map((playerId) => markerLayout.get(playerId)?.display)
                .filter((point): point is Point => Boolean(point));
              if (!points.length) return null;
              const center = points.reduce(
                (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
                { x: 0, y: 0 },
              );
              const x = Math.min(surfaceWidth - 300, Math.max(16, center.x + 34));
              const y = Math.min(SVG_HEIGHT - 66, Math.max(58, center.y - 54));
              const evidence = agentFocus.evidence.length > 68
                ? `${agentFocus.evidence.slice(0, 65)}…`
                : agentFocus.evidence;
              return (
                <g className="agent-callout" transform={`translate(${x} ${y})`}>
                  <rect width="286" height="52" />
                  <text className="agent-callout-kicker" x="12" y="16">COACH FOCUS · {agentFocus.time.toFixed(2)}S</text>
                  <text className="agent-callout-title" x="12" y="31">{agentFocus.title.slice(0, 48)}</text>
                  <text className="agent-callout-evidence" x="12" y="44">{evidence}</text>
                </g>
              );
            })()}
          </g>
        )}

        {!exporting && (
          <g className="collision-connector-layer" aria-hidden="true">
            {renderPlayers.map((player) => {
              const layout = markerLayout.get(player.id);
              if (!layout) return null;
              const offset = Math.hypot(
                layout.display.x - layout.canonical.x,
                layout.display.y - layout.canonical.y,
              );
              if (offset < 2) return null;
              return (
                <line
                  key={`${player.id}-connector`}
                  x1={layout.canonical.x}
                  y1={layout.canonical.y}
                  x2={layout.display.x}
                  y2={layout.display.y}
                  stroke={assignmentByPlayer.get(player.id)?.color ?? COLORS.bone}
                />
              );
            })}
          </g>
        )}

        <g className="player-layer">
          {renderPlayers.map((player) => {
            const layout = markerLayout.get(player.id);
            if (!layout) return null;
            const point = layout.display;
            const canonicalPoint = layout.canonical;
            const startPoint = fieldToSvg(player.start, surfaceWidth);
            const assignment = assignmentByPlayer.get(player.id);
            const selected = selectedPlayerIds.includes(player.id);
            const moved = Math.hypot(canonicalPoint.x - startPoint.x, canonicalPoint.y - startPoint.y) > 2;
            return (
              <g key={player.id}>
                {!exporting && moved && (
                  <circle
                    className="start-ghost"
                    cx={startPoint.x}
                    cy={startPoint.y}
                    r="11"
                    stroke={assignment?.color ?? COLORS.bone}
                  />
                )}
                <g
                  className={`player-marker ${player.team}${selected ? " selected" : ""}`}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${player.number} ${player.position}, ${player.team}`}
                  onPointerDown={(event) => onPlayerPointerDown(event, player.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") selectPlayers([player.id]);
                  }}
                >
                  {selected && (
                    <motion.circle
                      className="selection-ring"
                      r="17"
                      initial={reducedMotion ? false : { scale: 0.82, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        duration: reducedMotion ? 0 : undefined,
                        type: reducedMotion ? "tween" : "spring",
                        stiffness: 430,
                        damping: 27,
                      }}
                    />
                  )}
                  <circle className="player-disc" r="12" />
                  <text className="player-number" textAnchor="middle" y="4">
                    {player.number}
                  </text>
                  <text className="player-position" textAnchor="middle" y="27">
                    {player.position}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {exporting && (
        <div className="export-caption">
          <span>FIELDCRAFT</span>
          <strong>{play.name}</strong>
          <span>{play.formation} · {play.personnel}</span>
        </div>
      )}
    </div>
  );
}
