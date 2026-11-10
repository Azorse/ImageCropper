// Crop geometry. No DOM here.
//
// A crop is stored as { cx, cy, zoom }:
//   cx, cy  center of the crop as a fraction (0 to 1) of the photo
//   zoom    1 is the largest frame that fits inside the photo
//
// Max zoom stops where the frame would cover fewer photo pixels than the
// output needs, so exports are never upscaled.

import { clamp } from './utils.js';

/** Largest area with the target shape that fits inside the photo. */
export function baseCrop(iw, ih, tw, th) {
  const r = tw / th;
  return iw / ih > r ? { w: ih * r, h: ih } : { w: iw, h: iw / r };
}

export function maxZoom(iw, ih, tw, th) {
  return Math.max(1, Math.min(baseCrop(iw, ih, tw, th).w / tw, 20));
}

/** Turn a stored crop into a rectangle in photo pixels, kept inside the photo. */
export function cropRect(c, iw, ih, tw, th) {
  const b = baseCrop(iw, ih, tw, th);
  const zoom = clamp(c.zoom || 1, 1, maxZoom(iw, ih, tw, th));
  const w = b.w / zoom;
  const h = b.h / zoom;
  const x = clamp(c.cx * iw - w / 2, 0, iw - w);
  const y = clamp(c.cy * ih - h / 2, 0, ih - h);
  return { x, y, w, h, zoom };
}

/** Is the photo big enough for this preset without upscaling? */
export const isBigEnough = (iw, ih, p) => iw >= p.width && ih >= p.height;

export const defaultCrop = () => ({ cx: 0.5, cy: 0.5, zoom: 1 });
