export interface ThrowPoint { x: number; y: number }
export interface ThrowTarget extends ThrowPoint { id: string }

export interface CoffeeThrowResult {
  from: ThrowPoint;
  to: ThrowPoint;
  hitTargetId?: string;
}

function projectionOnSegment(point: ThrowPoint, from: ThrowPoint, to: ThrowPoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return { t: 0, distance: Math.hypot(point.x - from.x, point.y - from.y) };
  const rawT = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq;
  const t = Math.max(0, Math.min(1, rawT));
  const closestX = from.x + dx * t;
  const closestY = from.y + dy * t;
  return { t: rawT, distance: Math.hypot(point.x - closestX, point.y - closestY) };
}

/** Resolve a server-authoritative coffee trajectory, including wall clipping. */
export function resolveCoffeeThrow(
  from: ThrowPoint,
  rotY: number,
  targets: ThrowTarget[],
  isBlocked: (x: number, y: number) => boolean,
  maxDistance: number,
  hitRadius: number,
): CoffeeThrowResult {
  const direction = { x: Math.sin(rotY), y: Math.cos(rotY) };
  const step = 8;
  let clearDistance = 0;
  for (let distance = step; distance <= maxDistance; distance += step) {
    const x = from.x + direction.x * distance;
    const y = from.y + direction.y * distance;
    if (isBlocked(x, y)) break;
    clearDistance = distance;
  }
  const wallClippedTo = {
    x: from.x + direction.x * clearDistance,
    y: from.y + direction.y * clearDistance,
  };
  const hit = targets
    .map((target) => ({ target, ...projectionOnSegment(target, from, wallClippedTo) }))
    .filter(({ t, distance }) => t >= 0.05 && t <= 1 && distance <= hitRadius)
    .sort((a, b) => a.t - b.t)[0]?.target;
  return hit
    ? { from, to: { x: hit.x, y: hit.y }, hitTargetId: hit.id }
    : { from, to: wallClippedTo };
}
