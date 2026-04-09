import {
  createScreen,
  feedScreen,
  setTheme,
  getDefaults,
  type ScreenState,
  type Cell,
} from "./parser.js";
import type { CastFile } from "./cast.js";
import type { Theme } from "./themes.js";
import { themes } from "./themes.js";

export interface RenderOptions {
  theme?: Theme;
  window?: boolean;
  fontSize?: number;
  fontFamily?: string;
  padding?: number;
  lineHeight?: number;
  borderRadius?: number;
  speed?: number;
  maxIdle?: number;
  title?: string;
  crop?: boolean;
}

interface Frame {
  screen: ScreenState;
  time: number;
  duration: number;
}

function screenFingerprint(screen: ScreenState): string {
  const parts: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    for (let x = 0; x < screen.width; x++) {
      const c = screen.cells[y][x];
      parts.push(c.char, c.fg, c.bg);
    }
  }
  return parts.join("");
}

function buildFrames(cast: CastFile, maxIdleSeconds: number = 3, speed: number = 1): Frame[] {
  const { width, height } = cast.header;
  let screen = createScreen(width, height);
  const rawFrames: Frame[] = [];
  let lastFrameTime = 0;

  const mergedEvents: { time: number; data: string }[] = [];
  for (const event of cast.events) {
    if (event.type !== "o") continue;
    const last = mergedEvents[mergedEvents.length - 1];
    if (last && event.time - last.time < 0.016) {
      last.data += event.data;
    } else {
      mergedEvents.push({ time: event.time, data: event.data });
    }
  }

  for (let i = 0; i < mergedEvents.length; i++) {
    const event = mergedEvents[i];
    screen = feedScreen(screen, event.data);

    let time = event.time;
    if (time - lastFrameTime > maxIdleSeconds) {
      time = lastFrameTime + maxIdleSeconds;
    }

    const nextTime = mergedEvents[i + 1]?.time ?? time + 2;
    let duration = Math.min(nextTime - time, maxIdleSeconds);

    // Apply speed multiplier
    if (speed > 0 && speed !== 1) {
      duration = duration / speed;
    }

    rawFrames.push({ screen, time, duration });
    lastFrameTime = time;
  }

  // Deduplicate consecutive identical frames
  const frames: Frame[] = [];
  let prevFingerprint = "";
  for (const frame of rawFrames) {
    const fp = screenFingerprint(frame.screen);
    if (fp === prevFingerprint && frames.length > 0) {
      frames[frames.length - 1].duration += frame.duration;
    } else {
      frames.push({ ...frame });
      prevFingerprint = fp;
    }
  }

  return frames;
}

function findLastContentRow(screen: ScreenState, bgColor: string): number {
  for (let y = screen.height - 1; y >= 0; y--) {
    for (let x = 0; x < screen.width; x++) {
      const cell = screen.cells[y][x];
      if (cell.char !== " " || cell.bg !== bgColor) {
        return y;
      }
    }
  }
  return 0;
}

function applyTheme(opts: RenderOptions): { bg: string; fg: string; windowBar: string } {
  const theme = opts.theme ?? themes["one-dark"];
  setTheme(theme);
  return { bg: theme.background, fg: theme.foreground, windowBar: theme.windowBar };
}

export function renderSVG(cast: CastFile, opts: RenderOptions = {}): string {
  const {
    window: showWindow = true,
    fontSize = 14,
    fontFamily = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Menlo', 'Consolas', monospace",
    padding = 12,
    lineHeight = 1.35,
    borderRadius = 8,
    speed = 1,
    maxIdle = 3,
    title,
    crop = false,
  } = opts;

  const { bg, windowBar } = applyTheme(opts);
  const frames = buildFrames(cast, maxIdle, speed);
  if (frames.length === 0) return "<svg></svg>";

  const charWidth = fontSize * 0.6;
  const rowHeight = fontSize * lineHeight;
  const { width: cols, height: rows } = cast.header;

  let displayRows = rows;
  if (crop && frames.length > 0) {
    const lastScreen = frames[frames.length - 1].screen;
    const lastRow = findLastContentRow(lastScreen, bg);
    displayRows = Math.max(1, lastRow + 1);
  }

  const termWidth = cols * charWidth + padding * 2;
  const termHeight = displayRows * rowHeight + padding * 2;
  const windowBarHeight = showWindow ? 36 : 0;
  const svgWidth = termWidth + 20;
  const svgHeight = termHeight + windowBarHeight + 20;

  const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0) + 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`;

  svg += `<style>\n`;
  svg += `  .term-text { font-family: ${fontFamily}; font-size: ${fontSize}px; white-space: pre; }\n`;
  svg += `  .term-bold { font-weight: bold; }\n`;
  svg += `  .term-italic { font-style: italic; }\n`;
  svg += `  .frame { opacity: 0; }\n`;

  let accumulated = 0;
  for (let i = 0; i < frames.length; i++) {
    const startPct = (accumulated / totalDuration) * 100;
    const endPct = ((accumulated + frames[i].duration) / totalDuration) * 100;
    accumulated += frames[i].duration;

    svg += `  @keyframes f${i} {\n`;
    svg += `    0%, ${Math.max(0, startPct - 0.01).toFixed(2)}% { opacity: 0; }\n`;
    svg += `    ${startPct.toFixed(2)}%, ${endPct.toFixed(2)}% { opacity: 1; }\n`;
    svg += `    ${Math.min(100, endPct + 0.01).toFixed(2)}%, 100% { opacity: 0; }\n`;
    svg += `  }\n`;
    svg += `  .frame-${i} { animation: f${i} ${totalDuration.toFixed(2)}s infinite; }\n`;
  }
  svg += `</style>\n`;

  svg += `<rect x="10" y="10" width="${termWidth}" height="${termHeight + windowBarHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${bg}" />\n`;

  if (showWindow) {
    svg += `<g transform="translate(10, 10)">\n`;
    svg += `  <rect width="${termWidth}" height="${windowBarHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${windowBar}" />\n`;
    svg += `  <rect y="${windowBarHeight - borderRadius}" width="${termWidth}" height="${borderRadius}" fill="${windowBar}" />\n`;
    svg += `  <circle cx="24" cy="${windowBarHeight / 2}" r="6" fill="#ff5f56" />\n`;
    svg += `  <circle cx="44" cy="${windowBarHeight / 2}" r="6" fill="#ffbd2e" />\n`;
    svg += `  <circle cx="64" cy="${windowBarHeight / 2}" r="6" fill="#27c93f" />\n`;
    if (title) {
      const titleX = termWidth / 2;
      svg += `  <text x="${titleX}" y="${windowBarHeight / 2 + 5}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize - 1}px" fill="${opts.theme?.foreground ?? '#c9d1d9'}">${escapeXML(title)}</text>\n`;
    }
    svg += `</g>\n`;
  }

  const contentY = 10 + windowBarHeight + padding;
  const contentX = 10 + padding;

  for (let fi = 0; fi < frames.length; fi++) {
    const { screen } = frames[fi];
    svg += `<g class="frame frame-${fi}" transform="translate(${contentX}, ${contentY})">\n`;
    svg += renderScreen(screen, bg, charWidth, rowHeight, fontSize, crop ? displayRows : undefined);
    svg += `</g>\n`;
  }

  svg += `</svg>\n`;
  return svg;
}

export function renderStillSVG(cast: CastFile, opts: RenderOptions = {}): string {
  const {
    window: showWindow = true,
    fontSize = 14,
    fontFamily = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Menlo', 'Consolas', monospace",
    padding = 12,
    lineHeight = 1.35,
    borderRadius = 8,
    speed = 1,
    maxIdle = 3,
    title,
    crop = false,
  } = opts;

  const { bg, windowBar } = applyTheme(opts);
  const frames = buildFrames(cast, maxIdle, speed);
  if (frames.length === 0) return "<svg></svg>";

  const lastFrame = frames[frames.length - 1];
  const charWidth = fontSize * 0.6;
  const rowHeight = fontSize * lineHeight;
  const { width: cols, height: rows } = cast.header;

  let displayRows = rows;
  if (crop) {
    const lastRow = findLastContentRow(lastFrame.screen, bg);
    displayRows = Math.max(1, lastRow + 1);
  }

  const termWidth = cols * charWidth + padding * 2;
  const termHeight = displayRows * rowHeight + padding * 2;
  const windowBarHeight = showWindow ? 36 : 0;
  const svgWidth = termWidth + 20;
  const svgHeight = termHeight + windowBarHeight + 20;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`;
  svg += `<style>\n`;
  svg += `  .term-text { font-family: ${fontFamily}; font-size: ${fontSize}px; white-space: pre; }\n`;
  svg += `  .term-bold { font-weight: bold; }\n`;
  svg += `  .term-italic { font-style: italic; }\n`;
  svg += `</style>\n`;

  svg += `<rect x="10" y="10" width="${termWidth}" height="${termHeight + windowBarHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${bg}" />\n`;

  if (showWindow) {
    svg += `<g transform="translate(10, 10)">\n`;
    svg += `  <rect width="${termWidth}" height="${windowBarHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${windowBar}" />\n`;
    svg += `  <rect y="${windowBarHeight - borderRadius}" width="${termWidth}" height="${borderRadius}" fill="${windowBar}" />\n`;
    svg += `  <circle cx="24" cy="${windowBarHeight / 2}" r="6" fill="#ff5f56" />\n`;
    svg += `  <circle cx="44" cy="${windowBarHeight / 2}" r="6" fill="#ffbd2e" />\n`;
    svg += `  <circle cx="64" cy="${windowBarHeight / 2}" r="6" fill="#27c93f" />\n`;
    if (title) {
      const titleX = termWidth / 2;
      svg += `  <text x="${titleX}" y="${windowBarHeight / 2 + 5}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize - 1}px" fill="${opts.theme?.foreground ?? '#c9d1d9'}">${escapeXML(title)}</text>\n`;
    }
    svg += `</g>\n`;
  }

  const contentY = 10 + windowBarHeight + padding;
  const contentX = 10 + padding;

  svg += `<g transform="translate(${contentX}, ${contentY})">\n`;
  svg += renderScreen(lastFrame.screen, bg, charWidth, rowHeight, fontSize, crop ? displayRows : undefined);
  svg += `</g>\n`;

  svg += `</svg>\n`;
  return svg;
}

function renderScreen(
  screen: ScreenState,
  bgColor: string,
  charWidth: number,
  rowHeight: number,
  fontSize: number,
  maxRows?: number
): string {
  let result = "";
  const rowLimit = maxRows ?? screen.height;

  for (let y = 0; y < rowLimit; y++) {
    const row = screen.cells[y];
    let x = 0;

    while (x < screen.width) {
      const cell = row[x];
      if (cell.char === " " && cell.bg === bgColor && !cell.underline) {
        x++;
        continue;
      }

      let run = "";
      const style = cellStyle(cell);
      let runX = x;

      while (runX < screen.width) {
        const c = row[runX];
        if (cellStyle(c) !== style) break;
        run += escapeXML(c.char);
        runX++;
      }

      const trimmed = run.replace(/\s+$/, "");
      if (trimmed.length > 0) {
        const yPos = y * rowHeight + fontSize;
        const xPos = x * charWidth;

        if (cell.bg !== bgColor) {
          result += `  <rect x="${xPos}" y="${y * rowHeight}" width="${run.length * charWidth}" height="${rowHeight}" fill="${cell.bg}" />\n`;
        }

        let classes = "term-text";
        if (cell.bold) classes += " term-bold";
        if (cell.italic) classes += " term-italic";

        let textDecoration = "";
        if (cell.underline) textDecoration = ` text-decoration="underline"`;

        result += `  <text x="${xPos}" y="${yPos}" class="${classes}" fill="${cell.fg}"${textDecoration}>${trimmed}</text>\n`;
      }

      x = runX;
    }
  }

  return result;
}

function cellStyle(cell: Cell): string {
  return `${cell.fg}|${cell.bg}|${cell.bold}|${cell.dim}|${cell.italic}|${cell.underline}`;
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
