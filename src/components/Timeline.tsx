import { Pause, Play as PlayIcon, RotateCcw, SkipForward } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import type { Play } from "../types";

const speeds = [0.5, 1, 1.5];

export function Timeline({ play }: { play: Play }) {
  const { currentTime, isPlaying, setCurrentTime, setPlaying, setSpeed, speed } = useEditorStore();
  const tracks = play.assignments;
  const progress = (currentTime / play.duration) * 100;

  return (
    <section className="timeline-panel" aria-label="Play timing">
      <div className="phase-row">
        <div className={`phase${currentTime >= 0 ? " active" : ""}`}>
          <strong>SNAP</strong>
          <span>0.00</span>
        </div>
        <div className={`phase handoff${currentTime >= 1.4 ? " active" : ""}`}>
          <strong>HANDOFF</strong>
          <span>1.40</span>
        </div>
        <div className={`phase${currentTime >= 2.6 ? " active" : ""}`}>
          <strong>READ</strong>
          <span>2.60</span>
        </div>
        <span className="phase-end">{play.duration.toFixed(2)}</span>
      </div>
      <div className="tracks-wrap">
        <div className="playhead" style={{ left: `${progress}%` }}>
          <span>{currentTime.toFixed(2)}</span>
        </div>
        {tracks.map((assignment) => {
          const player = play.players.find((item) => item.id === assignment.playerId);
          const dots = Array.from({ length: 18 }, (_, index) =>
            assignment.startTime + (assignment.duration * index) / 17,
          ).filter((time) => time <= play.duration);
          return (
            <div className="timeline-track" key={assignment.id}>
              <span className="track-label">{player?.number} {player?.position}</span>
              <div className="track-line">
                {dots.map((time, index) => (
                  <span
                    key={`${assignment.id}-${index}`}
                    className={`track-dot${Math.abs(time - currentTime) < play.duration / 30 ? " current" : ""}`}
                    style={{
                      left: `${(time / play.duration) * 100}%`,
                      background: assignment.color,
                      opacity: time <= currentTime ? 0.92 : 0.28,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <input
          className="timeline-scrubber"
          type="range"
          min="0"
          max={play.duration}
          step="0.01"
          value={currentTime}
          aria-label="Playhead"
          onChange={(event) => setCurrentTime(Number(event.target.value))}
        />
      </div>
      <div className="playback-row">
        <div className="playback-controls">
          <button onClick={() => setCurrentTime(0)} aria-label="Restart">
            <RotateCcw size={19} strokeWidth={1.4} />
          </button>
          <button className="primary-play" onClick={() => setPlaying(!isPlaying)} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={21} fill="currentColor" /> : <PlayIcon size={21} fill="currentColor" />}
          </button>
          <button onClick={() => setCurrentTime(play.duration)} aria-label="Skip to end">
            <SkipForward size={19} strokeWidth={1.4} />
          </button>
        </div>
        <div className="time-readout">
          <strong>{currentTime.toFixed(2)}</strong>
          <span>/ {play.duration.toFixed(2)} SEC</span>
        </div>
        <label className="speed-control">
          <span className="sr-only">Playback speed</span>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {speeds.map((item) => (
              <option key={item} value={item}>{item}×</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
