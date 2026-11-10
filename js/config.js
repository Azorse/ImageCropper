// Size presets and output settings.
//
// Where settings come from, in order:
//   1. What this browser saved in Settings (localStorage)
//   2. presets.json next to index.html (team defaults)
//   3. BUILTIN below
//
// Preset IDs never change, so a CSV keeps working if a preset is renamed.

import { clone, clamp, norm, lsGet, lsSet } from './utils.js';

export const BUILTIN = {
  version: 1,
  presets: [
    { id: 'square1',    name: 'Square 1',    width: 400,  height: 400 },
    { id: 'square2',    name: 'Square 2',    width: 800,  height: 800 },
    { id: 'portrait1',  name: 'Portrait 1',  width: 600,  height: 800 },
    { id: 'portrait2',  name: 'Portrait 2',  width: 720,  height: 1280 },
    { id: 'landscape1', name: 'Landscape 1', width: 640,  height: 360 },
    { id: 'landscape2', name: 'Landscape 2', width: 1280, height: 720 }
  ],
  output: { format: 'auto', quality: 90 }
};

const LS_CONFIG = 'gbc.config.v1';
export const FORMATS = ['auto', 'original', 'jpg', 'png'];

/** Live settings. `current` is what the app uses; `defaults` is what Restore goes back to. */
export const cfg = { current: clone(BUILTIN), defaults: clone(BUILTIN), team: false };

/**
 * Validate and fill in a settings object from any source (form, file, storage).
 * Returns { config, errors }. Only use `config` when `errors` is empty.
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.presets)) {
    return { errors: ["This isn't a valid settings file."] };
  }
  const errors = [];
  const presets = BUILTIN.presets.map(def => {
    const src = raw.presets.find(p => p && norm(p.id) === def.id) || {};
    return {
      id: def.id,
      name: String(src.name ?? def.name).trim(),
      width: Number(src.width ?? def.width),
      height: Number(src.height ?? def.height)
    };
  });
  for (const p of presets) {
    const label = p.name || p.id;
    if (!p.name) {
      errors.push(`${p.id}: the name can't be blank.`);
    } else if (presets.some(o => o !== p && (norm(o.name) === norm(p.name) || o.id === norm(p.name)))) {
      errors.push(`"${p.name}" clashes with another preset's name or ID. Each preset needs its own name.`);
    }
    for (const k of ['width', 'height']) {
      if (!Number.isInteger(p[k]) || p[k] < 1 || p[k] > 10000) {
        errors.push(`${label}: ${k} must be a whole number from 1 to 10000.`);
      }
    }
  }
  const out = raw.output || {};
  const format = FORMATS.includes(out.format) ? out.format : 'auto';
  let quality = Number(out.quality ?? 90);
  if (!Number.isFinite(quality)) quality = 90;
  quality = clamp(Math.round(quality), 50, 100);
  return { config: { version: 1, presets, output: { format, quality } }, errors };
}

export async function loadTeamDefaults() {
  try {
    const res = await fetch('presets.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const r = normalizeConfig(await res.json());
    if (r.errors.length) {
      console.warn('presets.json was ignored:', r.errors);
      return;
    }
    cfg.defaults = r.config;
    cfg.team = true;
  } catch (e) {
    // No presets.json on the server. Built-in defaults are used.
  }
}

export function loadConfig() {
  const saved = lsGet(LS_CONFIG);
  if (saved) {
    try {
      const r = normalizeConfig(JSON.parse(saved));
      if (!r.errors.length) { cfg.current = r.config; return; }
    } catch (e) {}
  }
  cfg.current = clone(cfg.defaults);
}

/** Apply settings now and try to remember them. Returns false if the browser refused to store them. */
export function saveConfig(config) {
  cfg.current = config;
  return lsSet(LS_CONFIG, JSON.stringify(config));
}

/** Match a CSV preset value against preset IDs and names, ignoring case and spacing. */
export function resolvePreset(raw) {
  const n = norm(raw);
  if (!n) return null;
  return cfg.current.presets.find(p => p.id === n || norm(p.name) === n) || null;
}
