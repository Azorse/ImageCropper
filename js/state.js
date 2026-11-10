// Shared app state. Kept in one place so every module reads the same thing.

/** The loaded batch. */
export const state = {
  csvName: '',
  csvText: '',
  rows: [],          // one per CSV row, see batch.js for the fields
  csvErrors: [],     // problems that stop the whole batch
  csvWarnings: [],   // parser warnings worth showing

  files: new Map(),  // lowercase filename -> { name, getBlob() }
  dupFiles: new Set(),
  imgLabel: '',
  imgError: '',

  dims: new Map(),   // lowercase filename -> { w, h } or { error: true }
  checking: null,    // { done, total } while photos are being checked

  crops: {},         // row index -> { cx, cy, zoom } for confirmed crops
  batchKey: null,    // localStorage key for this CSV's saved progress
  restored: null,    // { count, savedAt } when progress was picked up
  started: false
};

/** The crop workspace. */
export const view = {
  list: [],     // rows that can be cropped, in CSV order
  pos: 0,       // index into list
  row: null,    // current row
  bmp: null,    // decoded photo for the current row
  draft: null,  // crop being edited, not saved until confirmed
  frame: null,  // crop frame on screen, in CSS pixels
  rect: null,   // crop area in photo pixels
  scale: 1,     // screen pixels per photo pixel
  token: 0      // bumps on every navigation so stale loads are ignored
};
