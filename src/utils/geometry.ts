import type { Assignment, PathSegment, Play, Point, Team } from "../types";

export const FIELD_LENGTH = 40;
export const FIELD_WIDTH = 53.3;
export const SVG_WIDTH = 1000;
export const SVG_HEIGHT = 500;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const snapPoint = (point: Point, enabled = true): Point => {
  if (!enabled) return point;
  return {
    x: Math.round(point.x * 2) / 2,
    y: Math.round(point.y * 2) / 2,
  };
};

export const fieldToSvg = (point: Point, surfaceWidth = SVG_WIDTH): Point => ({
  x: (point.x / FIELD_LENGTH) * surfaceWidth,
  y: (point.y / FIELD_WIDTH) * SVG_HEIGHT,
});

export const svgToField = (point: Point, surfaceWidth = SVG_WIDTH): Point => ({
  x: clamp((point.x / surfaceWidth) * FIELD_LENGTH, 0, FIELD_LENGTH),
  y: clamp((point.y / SVG_HEIGHT) * FIELD_WIDTH, 0, FIELD_WIDTH),
});

export const quadraticPoint = (from: Point, control: Point, to: Point, t: number): Point => {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * from.x + 2 * oneMinusT * t * control.x + t * t * to.x,
    y: oneMinusT * oneMinusT * from.y + 2 * oneMinusT * t * control.y + t * t * to.y,
  };
};

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

type SampledSegment = { points: Point[]; length: number };

const sampleSegment = (from: Point, segment: PathSegment): SampledSegment => {
  if (segment.type === "line") {
    return { points: [from, segment.to], length: distance(from, segment.to) };
  }

  const points = Array.from({ length: 21 }, (_, index) =>
    quadraticPoint(from, segment.control, segment.to, index / 20),
  );
  const length = points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
  return { points, length };
};

export const assignmentPolyline = (start: Point, assignment: Assignment): Point[] => {
  let cursor = start;
  const points: Point[] = [start];
  for (const segment of assignment.segments) {
    const sampled = sampleSegment(cursor, segment);
    points.push(...sampled.points.slice(1));
    cursor = segment.to;
  }
  return points;
};

export const assignmentPointAtProgress = (
  start: Point,
  assignment: Assignment,
  progress: number,
): Point => {
  const points = assignmentPolyline(start, assignment);
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const total = lengths.reduce((sum, item) => sum + item, 0);
  if (total === 0) return start;
  let remaining = clamp(progress, 0, 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (remaining <= segmentLength) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * t,
        y: points[index].y + (points[index + 1].y - points[index].y) * t,
      };
    }
    remaining -= segmentLength;
  }
  return points.at(-1) ?? start;
};

export const assignmentProgressAtTime = (assignment: Assignment, time: number) =>
  clamp((time - assignment.startTime) / Math.max(assignment.duration, 0.05), 0, 1);

export const playerPositionAtTime = (play: Play, playerId: string, time: number): Point => {
  const player = play.players.find((item) => item.id === playerId);
  if (!player) return { x: 0, y: 0 };
  const assignment = play.assignments.find((item) => item.playerId === playerId);
  if (!assignment) return player.start;
  return assignmentPointAtProgress(
    player.start,
    assignment,
    assignmentProgressAtTime(assignment, time),
  );
};

export const assignmentToSvgPath = (
  start: Point,
  assignment: Assignment,
  surfaceWidth = SVG_WIDTH,
): string => {
  const svgStart = fieldToSvg(start, surfaceWidth);
  const parts = [`M ${svgStart.x.toFixed(2)} ${svgStart.y.toFixed(2)}`];
  for (const segment of assignment.segments) {
    if (segment.type === "line") {
      const to = fieldToSvg(segment.to, surfaceWidth);
      parts.push(`L ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
    } else {
      const control = fieldToSvg(segment.control, surfaceWidth);
      const to = fieldToSvg(segment.to, surfaceWidth);
      parts.push(
        `Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
      );
    }
  }
  return parts.join(" ");
};

export const pathLengthYards = (start: Point, assignment: Assignment) => {
  const points = assignmentPolyline(start, assignment);
  return points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
};

export type PositionedMarker = {
  id: string;
  team: Team;
  point: Point;
  priority?: number;
};

const clampMarkerOffset = (point: Point, origin: Point, maxOffset: number): Point => {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const offset = Math.hypot(dx, dy);
  if (offset <= maxOffset || offset === 0) return point;
  const scale = maxOffset / offset;
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
};

/**
 * Resolves marker collisions in display space without changing football coordinates.
 * Higher-priority markers (the selected player or ball carrier) stay anchored while
 * nearby markers yield, making contact points readable without corrupting the play.
 */
export const resolveMarkerCollisions = (
  markers: PositionedMarker[],
  minDistance = 31,
  maxOffset = 36,
): Map<string, Point> => {
  const positions = markers.map((marker) => ({ ...marker.point }));

  for (let pass = 0; pass < 10; pass += 1) {
    for (let left = 0; left < markers.length; left += 1) {
      for (let right = left + 1; right < markers.length; right += 1) {
        const a = positions[left];
        const b = positions[right];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let currentDistance = Math.hypot(dx, dy);
        if (currentDistance >= minDistance) continue;

        if (currentDistance < 0.01) {
          if (markers[left].team !== markers[right].team) {
            dx = markers[left].team === "offense" ? 1 : -1;
            dy = 0;
          } else {
            const angle = ((left * 47 + right * 83) % 360) * (Math.PI / 180);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          }
          currentDistance = 1;
        }

        let unitX = dx / currentDistance;
        let unitY = dy / currentDistance;
        if (markers[left].team !== markers[right].team && Math.abs(unitX) < 0.72) {
          const direction = Math.abs(dx) > 0.01
            ? Math.sign(dx)
            : markers[left].team === "offense" ? 1 : -1;
          unitX = direction * 0.8;
          unitY = Math.sign(dy || 1) * 0.6;
        }

        const overlap = minDistance - Math.hypot(b.x - a.x, b.y - a.y) + 0.05;
        const leftPriority = markers[left].priority ?? 0;
        const rightPriority = markers[right].priority ?? 0;
        const leftShare = leftPriority > rightPriority ? 0 : rightPriority > leftPriority ? 1 : 0.5;
        const rightShare = 1 - leftShare;

        positions[left] = clampMarkerOffset(
          { x: a.x - unitX * overlap * leftShare, y: a.y - unitY * overlap * leftShare },
          markers[left].point,
          maxOffset,
        );
        positions[right] = clampMarkerOffset(
          { x: b.x + unitX * overlap * rightShare, y: b.y + unitY * overlap * rightShare },
          markers[right].point,
          maxOffset,
        );
      }
    }
  }

  return new Map(markers.map((marker, index) => [marker.id, positions[index]]));
};
