export interface CenteredDrawPosition {
  x: number;
  y: number;
  rotation: number;
}

export function normalizeRotation(rotation: number | null | undefined): number {
  const value = Number.isFinite(rotation) ? Number(rotation) : 0;
  return ((value % 360) + 360) % 360;
}

/**
 * pdf-lib rotates images/pages around the supplied bottom-left draw origin.
 * Return the origin that keeps the visual centre fixed at targetCenterX/Y for
 * any rotation angle.
 */
export function getCenteredDrawPosition(
  targetCenterX: number,
  targetCenterY: number,
  width: number,
  height: number,
  rotation: number | null | undefined,
): CenteredDrawPosition {
  const normalized = normalizeRotation(rotation);
  const radians = normalized * Math.PI / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const rotatedCenterX = Math.cos(radians) * halfWidth - Math.sin(radians) * halfHeight;
  const rotatedCenterY = Math.sin(radians) * halfWidth + Math.cos(radians) * halfHeight;

  return {
    x: targetCenterX - rotatedCenterX,
    y: targetCenterY - rotatedCenterY,
    rotation: normalized,
  };
}