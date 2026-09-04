import { CheckCircle2, ChevronDown, Download, RadioTower, Redo2, Share2, Undo2, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { isPlaybookDocument, useEditorStore } from "../store/editorStore";

type HeaderProps = {
  onExportPng: () => void;
};

const download = (href: string, filename: string) => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
};

export function Header({ onExportPng }: HeaderProps) {
  const { agentProposal, dispatch, future, history, playbook, redo, setToast, undo, webMcpStatus } = useEditorStore();
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const play = playbook.plays.find((item) => item.id === playbook.selectedPlayId) ?? playbook.plays[0];

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(playbook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    download(url, "fieldcraft-playbook.json");
    URL.revokeObjectURL(url);
    setToast("Playbook JSON exported");
    setExportOpen(false);
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isPlaybookDocument(parsed)) throw new Error("Invalid playbook");
      dispatch({ type: "playbook.replace", playbook: parsed });
      setToast(`${parsed.plays.length} plays imported`);
    } catch {
      setToast("That file is not a valid Fieldcraft playbook");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setExportOpen(false);
    }
  };

  return (
    <header className="app-header">
      <div className="brand-lockup">FIELDCRAFT</div>
      <div className="install-name">SATURDAY INSTALL</div>
      <span className="breadcrumb-slash">/</span>
      <input
        className="play-name-input"
        value={play?.name ?? ""}
        aria-label="Play name"
        disabled={Boolean(agentProposal)}
        onChange={(event) =>
          play && dispatch({ type: "play.rename", playId: play.id, name: event.target.value })
        }
      />
      <div className="header-spacer" />
      <div className={`site-tools-state ${webMcpStatus}`} title="Browser site tools status">
        <RadioTower size={13} strokeWidth={1.7} />
        <span>SITE TOOLS</span>
        <i>{webMcpStatus === "ready" ? "7 READY" : webMcpStatus.toUpperCase()}</i>
      </div>
      <div className="saved-state">
        <CheckCircle2 size={16} strokeWidth={1.7} />
        <span>SAVED</span>
      </div>
      <div className="header-divider" />
      <button className="icon-button" onClick={undo} disabled={!history.length || Boolean(agentProposal)} aria-label="Undo">
        <Undo2 size={20} strokeWidth={1.4} />
      </button>
      <button className="icon-button" onClick={redo} disabled={!future.length || Boolean(agentProposal)} aria-label="Redo">
        <Redo2 size={20} strokeWidth={1.4} />
      </button>
      <div className="header-divider" />
      <div className="export-wrap">
        <button className="export-button" onClick={() => setExportOpen((value) => !value)} aria-label="Export playbook">
          <Share2 size={18} strokeWidth={1.5} />
          <span>EXPORT</span>
          <ChevronDown size={12} />
        </button>
        <AnimatePresence>
          {exportOpen && (
            <motion.div
              className="export-menu"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              <button
                onClick={() => {
                  onExportPng();
                  setExportOpen(false);
                }}
              >
                <Download size={17} />
                Export play sheet PNG
              </button>
              <button onClick={exportJson}>
                <Download size={17} />
                Export editable JSON
              </button>
              <button onClick={() => fileInputRef.current?.click()}>
                <Upload size={17} />
                Import playbook JSON
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => importJson(event.target.files?.[0])}
        />
      </div>
    </header>
  );
}
