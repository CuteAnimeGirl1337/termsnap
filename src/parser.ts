/**
 * Minimal ANSI terminal emulator.
 * Parses escape sequences and maintains a screen buffer.
 * Supports configurable color themes.
 */

import type { Theme } from "./themes.js";
import { themes } from "./themes.js";

export interface Cell {
  char: string;
  fg: string;       // hex color
  bg: string;       // hex color
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ScreenState {
  cells: Cell[][];
  width: number;
  height: number;
  cursorX: number;
  cursorY: number;
}

// Active theme colors — set via setTheme()
let ANSI_COLORS = themes["one-dark"].colors;
let DEFAULT_FG = themes["one-dark"].foreground;
let DEFAULT_BG = themes["one-dark"].background;

export function setTheme(theme: Theme): void {
  ANSI_COLORS = theme.colors;
  DEFAULT_FG = theme.foreground;
  DEFAULT_BG = theme.background;
}

export function getDefaults() {
  return { fg: DEFAULT_FG, bg: DEFAULT_BG };
}

export function emptyCell(): Cell {
  return { char: " ", fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, dim: false, italic: false, underline: false };
}

export function createScreen(width: number, height: number): ScreenState {
  const cells: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    cells.push(Array.from({ length: width }, () => emptyCell()));
  }
  return { cells, width, height, cursorX: 0, cursorY: 0 };
}

export function cloneScreen(screen: ScreenState): ScreenState {
  return {
    ...screen,
    cells: screen.cells.map((row) => row.map((cell) => ({ ...cell }))),
  };
}

/**
 * Feed data through the terminal emulator and return the updated screen.
 */
export function feedScreen(screen: ScreenState, data: string): ScreenState {
  const s = cloneScreen(screen);
  let i = 0;
  let currentFg = DEFAULT_FG;
  let currentBg = DEFAULT_BG;
  let bold = false;
  let dim = false;
  let italic = false;
  let underline = false;

  while (i < data.length) {
    const ch = data[i];

    // ESC sequence
    if (ch === "\x1b" && i + 1 < data.length) {
      if (data[i + 1] === "[") {
        // CSI sequence
        i += 2;
        let params = "";
        while (i < data.length && data[i] >= "\x20" && data[i] <= "\x3f") {
          params += data[i];
          i++;
        }
        const cmd = i < data.length ? data[i] : "";
        i++;

        handleCSI(s, params, cmd);

        // Handle SGR (color/style) — update our tracking vars
        if (cmd === "m") {
          const result = parseSGR(params, currentFg, currentBg, bold, dim, italic, underline);
          currentFg = result.fg;
          currentBg = result.bg;
          bold = result.bold;
          dim = result.dim;
          italic = result.italic;
          underline = result.underline;
        }
        continue;
      } else if (data[i + 1] === "]") {
        // OSC sequence — skip until ST or BEL
        i += 2;
        while (i < data.length && data[i] !== "\x07" && !(data[i] === "\x1b" && data[i + 1] === "\\")) {
          i++;
        }
        if (i < data.length) i += data[i] === "\x1b" ? 2 : 1;
        continue;
      } else {
        // Other ESC sequences — skip
        i += 2;
        continue;
      }
    }

    // Carriage return
    if (ch === "\r") {
      s.cursorX = 0;
      i++;
      continue;
    }

    // Newline
    if (ch === "\n") {
      s.cursorY++;
      if (s.cursorY >= s.height) {
        scrollUp(s);
        s.cursorY = s.height - 1;
      }
      i++;
      continue;
    }

    // Tab
    if (ch === "\t") {
      const nextTab = (Math.floor(s.cursorX / 8) + 1) * 8;
      s.cursorX = Math.min(nextTab, s.width - 1);
      i++;
      continue;
    }

    // Backspace
    if (ch === "\b") {
      if (s.cursorX > 0) s.cursorX--;
      i++;
      continue;
    }

    // BEL
    if (ch === "\x07") {
      i++;
      continue;
    }

    // Skip other control chars
    if (ch.charCodeAt(0) < 32) {
      i++;
      continue;
    }

    // Regular character — write to screen
    if (s.cursorY >= 0 && s.cursorY < s.height && s.cursorX >= 0 && s.cursorX < s.width) {
      s.cells[s.cursorY][s.cursorX] = {
        char: ch,
        fg: currentFg,
        bg: currentBg,
        bold,
        dim,
        italic,
        underline,
      };
      s.cursorX++;
      if (s.cursorX >= s.width) {
        s.cursorX = 0;
        s.cursorY++;
        if (s.cursorY >= s.height) {
          scrollUp(s);
          s.cursorY = s.height - 1;
        }
      }
    }

    i++;
  }

  return s;
}

function handleCSI(s: ScreenState, params: string, cmd: string): void {
  const nums = params.split(";").map((n) => parseInt(n) || 0);

  switch (cmd) {
    case "A": s.cursorY = Math.max(0, s.cursorY - (nums[0] || 1)); break;
    case "B": s.cursorY = Math.min(s.height - 1, s.cursorY + (nums[0] || 1)); break;
    case "C": s.cursorX = Math.min(s.width - 1, s.cursorX + (nums[0] || 1)); break;
    case "D": s.cursorX = Math.max(0, s.cursorX - (nums[0] || 1)); break;
    case "H": case "f":
      s.cursorY = Math.min(s.height - 1, Math.max(0, (nums[0] || 1) - 1));
      s.cursorX = Math.min(s.width - 1, Math.max(0, (nums[1] || 1) - 1));
      break;
    case "J": eraseDisplay(s, nums[0] || 0); break;
    case "K": eraseLine(s, nums[0] || 0); break;
    case "G": s.cursorX = Math.min(s.width - 1, Math.max(0, (nums[0] || 1) - 1)); break;
    case "d": s.cursorY = Math.min(s.height - 1, Math.max(0, (nums[0] || 1) - 1)); break;
  }
}

function eraseDisplay(s: ScreenState, mode: number): void {
  if (mode === 0) {
    for (let x = s.cursorX; x < s.width; x++) s.cells[s.cursorY][x] = emptyCell();
    for (let y = s.cursorY + 1; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) s.cells[y][x] = emptyCell();
    }
  } else if (mode === 1) {
    for (let y = 0; y < s.cursorY; y++) {
      for (let x = 0; x < s.width; x++) s.cells[y][x] = emptyCell();
    }
    for (let x = 0; x <= s.cursorX; x++) s.cells[s.cursorY][x] = emptyCell();
  } else if (mode === 2 || mode === 3) {
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) s.cells[y][x] = emptyCell();
    }
  }
}

function eraseLine(s: ScreenState, mode: number): void {
  if (mode === 0) {
    for (let x = s.cursorX; x < s.width; x++) s.cells[s.cursorY][x] = emptyCell();
  } else if (mode === 1) {
    for (let x = 0; x <= s.cursorX; x++) s.cells[s.cursorY][x] = emptyCell();
  } else if (mode === 2) {
    for (let x = 0; x < s.width; x++) s.cells[s.cursorY][x] = emptyCell();
  }
}

function scrollUp(s: ScreenState): void {
  s.cells.shift();
  s.cells.push(Array.from({ length: s.width }, () => emptyCell()));
}

interface SGRState {
  fg: string;
  bg: string;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

function parseSGR(
  params: string,
  fg: string,
  bg: string,
  bold: boolean,
  dim: boolean,
  italic: boolean,
  underline: boolean
): SGRState {
  const nums = params === "" ? [0] : params.split(";").map((n) => parseInt(n) || 0);
  let i = 0;

  while (i < nums.length) {
    const code = nums[i];

    if (code === 0) {
      fg = DEFAULT_FG; bg = DEFAULT_BG;
      bold = false; dim = false; italic = false; underline = false;
    } else if (code === 1) bold = true;
    else if (code === 2) dim = true;
    else if (code === 3) italic = true;
    else if (code === 4) underline = true;
    else if (code === 22) { bold = false; dim = false; }
    else if (code === 23) italic = false;
    else if (code === 24) underline = false;
    else if (code >= 30 && code <= 37) fg = ANSI_COLORS[code - 30 + (bold ? 8 : 0)];
    else if (code === 38) {
      if (nums[i + 1] === 5 && nums[i + 2] !== undefined) { fg = color256ToHex(nums[i + 2]); i += 2; }
      else if (nums[i + 1] === 2 && nums[i + 4] !== undefined) { fg = rgbToHex(nums[i + 2], nums[i + 3], nums[i + 4]); i += 4; }
    } else if (code === 39) fg = DEFAULT_FG;
    else if (code >= 40 && code <= 47) bg = ANSI_COLORS[code - 40];
    else if (code === 48) {
      if (nums[i + 1] === 5 && nums[i + 2] !== undefined) { bg = color256ToHex(nums[i + 2]); i += 2; }
      else if (nums[i + 1] === 2 && nums[i + 4] !== undefined) { bg = rgbToHex(nums[i + 2], nums[i + 3], nums[i + 4]); i += 4; }
    } else if (code === 49) bg = DEFAULT_BG;
    else if (code >= 90 && code <= 97) fg = ANSI_COLORS[code - 90 + 8];
    else if (code >= 100 && code <= 107) bg = ANSI_COLORS[code - 100 + 8];

    i++;
  }

  return { fg, bg, bold, dim, italic, underline };
}

function color256ToHex(n: number): string {
  if (n < 16) return ANSI_COLORS[n];
  if (n >= 232) {
    const g = 8 + (n - 232) * 10;
    return rgbToHex(g, g, g);
  }
  const idx = n - 16;
  const r = Math.floor(idx / 36);
  const g = Math.floor((idx % 36) / 6);
  const b = idx % 6;
  return rgbToHex(r ? r * 40 + 55 : 0, g ? g * 40 + 55 : 0, b ? b * 40 + 55 : 0);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
