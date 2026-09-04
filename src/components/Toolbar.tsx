import {
  Eraser,
  Grid3X3,
  Move,
  MousePointer2,
  PencilLine,
  Route,
  Ruler,
  Shield,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { getSelectedPlay, useEditorStore } from "../store/editorStore";
import type { EditorTool } from "../types";
import { createPresetAssignment, ROUTE_PRESETS } from "../utils/presets";

const toolItems: Array<{
  id: EditorTool;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "select", label: "SELECT", icon: MousePointer2 },
  { id: "move", label: "MOVE", icon: Move },
  { id: "draw", label: "DRAW", icon: PencilLine },
  { id: "route", label: "ROUTE", icon: Route },
  { id: "block", label: "BLOCK", icon: Workflow },
  { id: "assign", label: "ASSIGN", icon: Shield },
  { id: "erase", label: "ERASE", icon: Eraser },
];

export function Toolbar() {
  const {
    activeTool,
    agentProposal,
    dispatch,
    gridEnabled,
    measureEnabled,
    playbook,
    selectedPlayerIds,
    selectAssignment,
    setTool,
    setToast,
    toggleGrid,
    toggleMeasure,
  } = useEditorStore();
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const play = getSelectedPlay(playbook);
  const selectedPlayer = play?.players.find((player) => player.id === selectedPlayerIds.at(-1));

  const applyPreset = (preset: string, kind: "route" | "block" | "rush" | "drop") => {
    if (!selectedPlayer) {
      setToast("Select a player first");
      return;
    }
    if (kind === "route" && selectedPlayer.team !== "offense") {
      setToast("Routes belong to offensive players");
      return;
    }
    if ((kind === "rush" || kind === "drop") && selectedPlayer.team !== "defense") {
      setToast("Select a scout defender to assign movement");
      return;
    }
    const assignment = createPresetAssignment(selectedPlayer, preset, kind);
    dispatch({ type: "assignment.upsert", assignment });
    selectAssignment(assignment.id);
    setToast(`${preset.toUpperCase()} assignment added`);
  };

  const activateTool = (tool: EditorTool) => {
    setTool(tool);
    if (tool === "route") {
      setRouteMenuOpen((value) => !value);
      return;
    }
    setRouteMenuOpen(false);
    if (tool === "draw") applyPreset("go", "route");
    if (tool === "block") applyPreset("block", "block");
    if (tool === "assign") {
      const kind = selectedPlayer?.position.includes("LB") ? "drop" : "rush";
      applyPreset(kind, kind);
    }
  };

  return (
    <nav className="toolbar" aria-label="Editor tools">
      <div className="tool-group">
        {toolItems.map(({ id, label, icon: Icon }) => (
          <div className="tool-wrap" key={id}>
            <button
              className={`tool-button${activeTool === id ? " active" : ""}`}
              onClick={() => activateTool(id)}
              aria-pressed={activeTool === id}
              aria-label={label}
              disabled={Boolean(agentProposal)}
            >
              <Icon size={17} strokeWidth={1.45} />
              <span>{label}</span>
            </button>
            {id === "route" && (
              <AnimatePresence>
                {routeMenuOpen && (
                  <motion.div
                    className="route-menu"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    <div className="route-menu-label">ROUTE PRESETS</div>
                    <div className="route-grid">
                      {ROUTE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            applyPreset(preset, "route");
                            setRouteMenuOpen(false);
                          }}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        ))}
      </div>
      <div className="tool-group utility-tools">
        <button className={`tool-button${gridEnabled ? " enabled" : ""}`} onClick={toggleGrid} disabled={Boolean(agentProposal)} aria-label="Toggle grid">
          <Grid3X3 size={18} strokeWidth={1.45} />
          <span>GRID</span>
        </button>
        <button className={`tool-button${measureEnabled ? " enabled" : ""}`} onClick={toggleMeasure} disabled={Boolean(agentProposal)} aria-label="Toggle measurement">
          <Ruler size={18} strokeWidth={1.45} />
          <span>MEASURE</span>
        </button>
      </div>
    </nav>
  );
}
