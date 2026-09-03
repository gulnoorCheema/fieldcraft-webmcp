import { Route } from "lucide-react";
import { COLORS } from "../data/templates";
import { getSelectedAssignment, useEditorStore } from "../store/editorStore";
import type { Assignment, AssignmentKind, Play } from "../types";
import { pathLengthYards } from "../utils/geometry";

const colorOptions = [COLORS.orange, COLORS.blue, COLORS.yellow, COLORS.coral, COLORS.bone];

export function Inspector({ play }: { play: Play }) {
  const { dispatch, selectedAssignmentId, selectedPlayerIds, setTool } = useEditorStore();
  const assignment = getSelectedAssignment(play, selectedAssignmentId);
  const player = play.players.find(
    (item) => item.id === (assignment?.playerId ?? selectedPlayerIds.at(-1)),
  );

  if (!player) {
    return (
      <section className="inspector empty-inspector">
        <div className="eyebrow">SELECTION</div>
        <strong>Choose a player or path</strong>
        <p>Inspect assignments, adjust timing, or drag directly on the field.</p>
      </section>
    );
  }

  const length = assignment ? pathLengthYards(player.start, assignment) : 0;
  const update = (patch: Partial<Assignment>) => {
    if (!assignment) return;
    dispatch({ type: "assignment.update", assignmentId: assignment.id, patch });
  };

  const updateDepth = (depth: number) => {
    if (!assignment || !assignment.segments.length) return;
    const segments = structuredClone(assignment.segments);
    segments[segments.length - 1].to.x = player.start.x + depth;
    update({ segments });
  };

  return (
    <section className="inspector" aria-label="Selected assignment">
      <div className="inspector-topline">
        <div>
          <div className="eyebrow">SELECTED {assignment ? "ASSIGNMENT" : "PLAYER"}</div>
          <div className="selection-title">
            <strong>{player.position} {player.number}</strong>
            <span>{player.position}</span>
          </div>
        </div>
        <button className="edit-path-button" onClick={() => setTool("move")} disabled={!assignment}>
          EDIT PATH <Route size={17} strokeWidth={1.4} />
        </button>
      </div>

      <div className="inspector-grid">
        <div className="inspector-fields">
          <label>
            <span>NUMBER</span>
            <input
              type="number"
              min="0"
              max="99"
              value={player.number}
              onChange={(event) =>
                dispatch({
                  type: "player.update",
                  playerId: player.id,
                  patch: { number: Number(event.target.value) },
                })
              }
            />
          </label>
          <label>
            <span>POSITION</span>
            <input
              value={player.position}
              onChange={(event) =>
                dispatch({
                  type: "player.update",
                  playerId: player.id,
                  patch: { position: event.target.value.toUpperCase().slice(0, 4) },
                })
              }
            />
          </label>
          {assignment && (
            <>
              <label>
                <span>TYPE</span>
                <select
                  value={assignment.kind}
                  onChange={(event) => update({ kind: event.target.value as AssignmentKind })}
                >
                  {(player.team === "offense"
                    ? ["route", "run", "block", "motion"]
                    : ["rush", "drop", "blitz", "man"]
                  ).map((kind) => <option key={kind}>{kind}</option>)}
                </select>
              </label>
              <label>
                <span>TECHNIQUE</span>
                <input
                  value={assignment.technique ?? assignment.preset ?? "CUSTOM"}
                  onChange={(event) => update({ technique: event.target.value.toUpperCase() })}
                />
              </label>
            </>
          )}
        </div>

        <div className="assignment-summary" style={{ borderTopColor: assignment?.color ?? COLORS.bone }}>
          <span>{assignment?.kind ?? player.team}</span>
          <strong>{assignment?.technique ?? assignment?.preset ?? "UNASSIGNED"}</strong>
          <small>{assignment ? `${length.toFixed(1)} YARDS` : "POSITION ONLY"}</small>
        </div>

        {assignment ? (
          <div className="timing-fields">
            <label>
              <span>START</span>
              <div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, play.duration - 0.2)}
                  step="0.05"
                  value={assignment.startTime}
                  onChange={(event) => update({ startTime: Number(event.target.value) })}
                />
                <output>{assignment.startTime.toFixed(2)} SEC</output>
              </div>
            </label>
            <label>
              <span>TRAVEL TIME</span>
              <div>
                <input
                  type="range"
                  min="0.2"
                  max={play.duration}
                  step="0.05"
                  value={assignment.duration}
                  onChange={(event) => update({ duration: Number(event.target.value) })}
                />
                <output>{assignment.duration.toFixed(2)} SEC</output>
              </div>
            </label>
            <div className="stat-row"><span>PATH LENGTH</span><strong>{length.toFixed(1)} YDS</strong></div>
            <div className="color-row">
              <span>COLOR</span>
              <div>
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    className={assignment.color === color ? "active" : ""}
                    style={{ background: color }}
                    onClick={() => update({ color })}
                    aria-label={`Use ${color}`}
                  />
                ))}
              </div>
            </div>
            <label>
              <span>DEPTH</span>
              <div className="compact-control">
                <input
                  type="number"
                  step="0.5"
                  value={(assignment.segments.at(-1)!.to.x - player.start.x).toFixed(1)}
                  onChange={(event) => updateDepth(Number(event.target.value))}
                />
                <output>YDS</output>
              </div>
            </label>
            <label>
              <span>TARGET</span>
              <select
                className="target-select"
                value={assignment.targetPlayerId ?? ""}
                onChange={(event) => update({ targetPlayerId: event.target.value || undefined })}
              >
                <option value="">NONE</option>
                {play.players
                  .filter((candidate) => candidate.id !== player.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.number} {candidate.position}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="no-assignment">Use ROUTE, BLOCK, or ASSIGN to add movement.</div>
        )}
      </div>
    </section>
  );
}
