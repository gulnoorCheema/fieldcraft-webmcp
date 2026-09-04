import { Copy, FilePlus2, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { BLANK_FORMATIONS, PERSONNEL_OPTIONS, PLAY_TEMPLATES } from "../data/templates";
import { useEditorStore } from "../store/editorStore";

export function PlayRail() {
  const { agentProposal, playbook, dispatch } = useEditorStore();
  const [creating, setCreating] = useState(false);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [blankName, setBlankName] = useState("Untitled Play");
  const [blankFormation, setBlankFormation] = useState<(typeof BLANK_FORMATIONS)[number]>("Pistol");
  const [blankPersonnel, setBlankPersonnel] = useState<(typeof PERSONNEL_OPTIONS)[number]>("11 personnel");
  const activePlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activePlayRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [playbook.selectedPlayId]);

  const createBlankPlay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch({
      type: "play.createBlank",
      name: blankName,
      formation: blankFormation,
      personnel: blankPersonnel,
    });
    setCreating(false);
    setCreatingBlank(false);
    setBlankName("Untitled Play");
  };

  return (
    <aside className="play-rail" aria-label="Playbook">
      <div className="rail-title">PLAYS</div>
      <div className="rail-list">
        {playbook.plays.map((play, index) => {
          const active = play.id === playbook.selectedPlayId;
          return (
            <div
              ref={active ? activePlayRef : undefined}
              className={`rail-play-row${active ? " active" : ""}`}
              key={play.id}
            >
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
            <div className="template-menu-label">START FROM SCRATCH</div>
            {!creatingBlank ? (
              <button className="blank-concept-trigger" onClick={() => setCreatingBlank(true)}>
                <span className="blank-concept-name"><FilePlus2 size={15} /> Blank Concept</span>
                <small>11 ON 11 · NO ASSIGNMENTS</small>
              </button>
            ) : (
              <form className="blank-play-form" onSubmit={createBlankPlay}>
                <label>
                  PLAY NAME
                  <input
                    autoFocus
                    value={blankName}
                    maxLength={60}
                    onChange={(event) => setBlankName(event.target.value)}
                  />
                </label>
                <div className="blank-play-selects">
                  <label>
                    FORMATION
                    <select
                      value={blankFormation}
                      onChange={(event) => setBlankFormation(event.target.value as (typeof BLANK_FORMATIONS)[number])}
                    >
                      {BLANK_FORMATIONS.map((formation) => <option key={formation}>{formation}</option>)}
                    </select>
                  </label>
                  <label>
                    PERSONNEL
                    <select
                      value={blankPersonnel}
                      onChange={(event) => setBlankPersonnel(event.target.value as (typeof PERSONNEL_OPTIONS)[number])}
                    >
                      {PERSONNEL_OPTIONS.map((personnel) => <option key={personnel}>{personnel}</option>)}
                    </select>
                  </label>
                </div>
                <div className="blank-play-actions">
                  <button type="button" onClick={() => setCreatingBlank(false)}>CANCEL</button>
                  <button className="blank-play-create" type="submit" disabled={!blankName.trim()}>CREATE PLAY</button>
                </div>
              </form>
            )}
            <div className="template-menu-divider"><span>OR START FROM A CONCEPT</span></div>
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
