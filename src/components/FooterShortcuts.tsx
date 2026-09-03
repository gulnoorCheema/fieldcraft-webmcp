import { Copy, Trash2 } from "lucide-react";
import { getSelectedPlay, useEditorStore } from "../store/editorStore";

export function FooterShortcuts() {
  const { dispatch, playbook, selectedAssignmentId, selectedPlayerIds, selectAssignment, selectPlayers, setToast } = useEditorStore();
  const play = getSelectedPlay(playbook);

  const removeSelection = () => {
    if (selectedAssignmentId) {
      dispatch({ type: "assignment.delete", assignmentId: selectedAssignmentId });
      selectAssignment(null);
      setToast("Assignment cleared");
      return;
    }
    selectedPlayerIds.forEach((playerId) => dispatch({ type: "player.delete", playerId }));
    selectPlayers([]);
  };

  const duplicate = () => {
    if (selectedPlayerIds.length) {
      dispatch({ type: "players.duplicate", playerIds: selectedPlayerIds, offset: { x: 1, y: 1 } });
      setToast("Selection duplicated");
      return;
    }
    if (play) dispatch({ type: "play.duplicate", playId: play.id });
  };

  return (
    <footer className="shortcut-footer">
      <button onClick={removeSelection} disabled={!selectedAssignmentId && !selectedPlayerIds.length}>
        <kbd>DEL</kbd>
        <Trash2 size={14} />
        DELETE
      </button>
      <button onClick={duplicate}>
        <kbd>D</kbd>
        <Copy size={14} />
        {selectedPlayerIds.length ? "DUPLICATE" : "DUPLICATE PLAY"}
      </button>
      <div><kbd>R</kbd> REFLECT PATH</div>
      <div><kbd>SHIFT</kbd> MULTI-SELECT</div>
      <div><kbd>⌥</kbd> FREE MOVE</div>
      <div><kbd>TAB</kbd> NEXT ASSIGNMENT</div>
    </footer>
  );
}
