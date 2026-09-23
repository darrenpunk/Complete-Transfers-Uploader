import assert from "node:assert/strict";
import {
  canvasRotationToPdfRotation,
  getCenteredDrawPosition,
  normalizeRotation,
} from "../server/pdf-placement";

function transformedCenter(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
) {
  const radians = rotation * Math.PI / 180;
  return {
    x: x + Math.cos(radians) * width / 2 - Math.sin(radians) * height / 2,
    y: y + Math.sin(radians) * width / 2 + Math.cos(radians) * height / 2,
  };
}

for (const rotation of [0, 37, 90, 180, 270, 359, -90, 450]) {
  const target = { x: 420.5, y: 215.25 };
  const placement = getCenteredDrawPosition(target.x, target.y, 170, 55, rotation);
  const center = transformedCenter(
    placement.x,
    placement.y,
    170,
    55,
    placement.rotation,
  );
  assert.ok(Math.abs(center.x - target.x) < 1e-9, `x center drift at ${rotation}°`);
  assert.ok(Math.abs(center.y - target.y) < 1e-9, `y center drift at ${rotation}°`);
}

assert.equal(normalizeRotation(-90), 270);
assert.equal(normalizeRotation(450), 90);
assert.equal(normalizeRotation(undefined), 0);
assert.equal(canvasRotationToPdfRotation(0), 0);
assert.equal(canvasRotationToPdfRotation(90), 270);
assert.equal(canvasRotationToPdfRotation(180), 180);
assert.equal(canvasRotationToPdfRotation(270), 90);
assert.equal(canvasRotationToPdfRotation(-90), 90);

// A point to the right of an element's centre must move visually downward
// under CSS rotate(+90deg). PDF +270deg moves that point toward negative PDF Y,
// which is downward after rendering into screen coordinates.
const pdfQuarterTurn = canvasRotationToPdfRotation(90);
const quarterTurnRadians = pdfQuarterTurn * Math.PI / 180;
const rotatedRightPointPdfY = Math.sin(quarterTurnRadians) * 10;
assert.ok(rotatedRightPointPdfY < 0, "canvas +90° must remain visually clockwise in PDF output");

console.log("pdf placement tests passed");