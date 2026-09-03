import { Copy, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { PLAY_TEMPLATES } from "../data/templates";
import { useEditorStore } from "../store/editorStore";

export function PlayRail() {
  const { agentProposal, playbook, dispatch } = useEditorStore();
  const [creating, setCreating] = useState(false);

  return (
    <aside className="play-rail" aria-label="Playbook">
      <div className="rail-title">PLAYS</div>
      <div className="rail-list">
        {playbook.plays.map((play, index) => {
          const active = play.id === playbook.selectedPlayId;
          return (
            <div className={`rail-play-row${active ? " active" : ""}`} key={play.id}>
              <button
                className={`rail-play${active ? " active" : ""}`}
                onClick={() => dispatch({ type: "play.select", playId: play.id })}
                disabled={Boolean(agentProposal)}
                title={play.name}
              >
                <span className="rail-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="rail-name">{play.name}</span>
              </button>
              {active && (
                <div className="rail-play-actions">
                  <button
                    aria-label={`Duplicate ${play.name}`}
                    onClick={() => dispatch({ type: "play.duplicate", playId: play.id })}
                    disabled={Boolean(agentProposal)}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    aria-label={`Delete ${play.name}`}
                    onClick={() => dispatch({ type: "play.delete", playId: play.id })}
                    disabled={Boolean(agentProposal)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="rail-add" onClick={() => setCreating((value) => !value)} aria-label="New play" disabled={Boolean(agentProposal)}>
        <Plus size={21} strokeWidth={1.4} />
      </button>
      <AnimatePresence>
        {creating && (
          <motion.div
            className="template-menu"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <div className="template-menu-label">START FROM A CONCEPT</div>
            {PLAY_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  dispatch({ type: "play.createFromTemplate", templateId: template.id });
                  setCreating(false);
                }}
              >
                <span>{template.name}</span>
                <small>{template.formation}</small>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
