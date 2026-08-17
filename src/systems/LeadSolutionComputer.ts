import * as THREE from 'three';

export type LeadSolution = {
  valid: boolean;
  time: number;
  point: THREE.Vector3;
};

const EPSILON = 1e-6;

/**
 * Solves |relativePosition + relativeVelocity * t| = projectileSpeed * t.
 * Callers own the output object, so combat HUD updates do not allocate.
 */
export function computeLeadSolution(
  origin: THREE.Vector3,
  relativePosition: THREE.Vector3,
  relativeVelocity: THREE.Vector3,
  projectileSpeed: number,
  output: LeadSolution
): LeadSolution {
  if (!Number.isFinite(projectileSpeed)) {
    output.valid = true;
    output.time = 0;
    output.point.copy(origin).add(relativePosition);
    return output;
  }
  if (projectileSpeed <= EPSILON) {
    output.valid = false;
    output.time = 0;
    return output;
  }

  const a = relativeVelocity.lengthSq() - projectileSpeed * projectileSpeed;
  const b = 2 * relativePosition.dot(relativeVelocity);
  const c = relativePosition.lengthSq();
  let time = Number.POSITIVE_INFINITY;

  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) > EPSILON) {
      const linearTime = -c / b;
      if (linearTime > EPSILON) time = linearTime;
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const first = (-b - root) / (2 * a);
      const second = (-b + root) / (2 * a);
      if (first > EPSILON) time = first;
      if (second > EPSILON && second < time) time = second;
    }
  }

  if (!Number.isFinite(time)) {
    output.valid = false;
    output.time = 0;
    return output;
  }
  output.valid = true;
  output.time = time;
  output.point.copy(origin).add(relativePosition).addScaledVector(relativeVelocity, time);
  return output;
}
