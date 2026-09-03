import { Check, GitBranch, Pause, Play as PlayIcon, RotateCcw, ShieldCheck, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { describeAgentChange, isProposalTargetResolved } from "../coach/proposals";
import { useEditorStore } from "../store/editorStore";
import type { Play } from "../types";

export function CoachReview({ basePlay }: { basePlay: Play }) {
  const reducedMotion = useReducedMotion();
  const {
    agentProposal,
    commitAgentProposal,
    currentTime,
    discardAgentProposal,
    isPlaying,
    proposalView,
    setCurrentTime,
    setPlaying,
    setProposalView,
  } = useEditorStore();
  if (!agentProposal) return null;

  const beforeCount = agentProposal.beforeFindings.filter(
    (finding) => finding.severity !== "note",
  ).length;
  const afterCount = agentProposal.afterFindings.filter(
    (finding) => finding.severity !== "note",
  ).length;
  const targetResolved = isProposalTargetResolved(agentProposal);

  return (
    <motion.section
      className="coach-review"
      aria-label="Coach review"
      initial={reducedMotion ? false : { opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
    >
      <div className="coach-review-topline">
        <div>
          <div className="eyebrow"><ShieldCheck size={12} /> COACH REVIEW</div>
          <div className="coach-review-title">
            <strong>{agentProposal.name}</strong>
            <span>{agentProposal.mode === "variation" ? <GitBranch size={11} /> : null}{agentProposal.mode}</span>
          </div>
        </div>
        <div className="review-toggle" role="group" aria-label="Preview source">
          {(["before", "after"] as const).map((view) => (
            <button
              key={view}
              className={proposalView === view ? "active" : ""}
              onClick={() => setProposalView(view)}
              aria-pressed={proposalView === view}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      <p className="coach-rationale">{agentProposal.rationale}</p>

      <div className="coach-review-body">
        <div className="change-list">
          {agentProposal.changes.slice(0, 4).map((change, index) => (
            <div className="change-row" key={`${change.type}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{describeAgentChange(change, basePlay)}</strong>
            </div>
          ))}
          {agentProposal.changes.length > 4 ? (
            <div className="change-more">+{agentProposal.changes.length - 4} more changes</div>
          ) : null}
        </div>

        <div className="review-score">
          <span>SPATIAL RISKS</span>
          <div><strong>{beforeCount}</strong><i>→</i><strong>{afterCount}</strong></div>
          {targetResolved !== undefined ? (
            <small className={targetResolved ? "resolved" : "open"}>
              {targetResolved ? <Check size={11} /> : null}
              TARGET {targetResolved ? "CLEARED" : "STILL OPEN"}
            </small>
          ) : <small>PROPOSAL COMPARISON</small>}
        </div>
      </div>

      <div className="review-actions">
        <div className="review-playback">
          <button onClick={() => setCurrentTime(0)} aria-label="Restart preview">
            <RotateCcw size={14} />
          </button>
          <button onClick={() => setPlaying(!isPlaying)} aria-label={isPlaying ? "Pause preview" : "Play preview"}>
            {isPlaying ? <Pause size={14} /> : <PlayIcon size={14} />}
          </button>
          <span>{currentTime.toFixed(2)}s</span>
        </div>
        <button className="review-discard" onClick={discardAgentProposal}>
          <X size={14} /> DISCARD
        </button>
        <button className="review-apply" onClick={() => commitAgentProposal(agentProposal.id)}>
          <Check size={14} /> APPLY
        </button>
      </div>
    </motion.section>
  );
}
