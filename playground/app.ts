/**
 * termsnap playground — browser-side .cast → SVG renderer.
 * This is a standalone browser bundle — it re-implements the parser/renderer
 * without Node/Bun dependencies so it works in any browser.
 */

// ── Themes ──────────────────────────────────────────────────────────

interface Theme {
  name: string;
  background: string;
  foreground: string;
  windowBar: string;
  colors: string[];
}

const themes: Record<string, Theme> = {
  "one-dark": {
    name: "One Dark", background: "#282c34", foreground: "#abb2bf", windowBar: "#21252b",
    colors: ["#282c34","#e06c75","#98c379","#e5c07b","#61afef","#c678dd","#56b6c2","#abb2bf","#5c6370","#e06c75","#98c379","#e5c07b","#61afef","#c678dd","#56b6c2","#ffffff"],
  },
  dracula: {
    name: "Dracula", background: "#282a36", foreground: "#f8f8f2", windowBar: "#1e1f29",
    colors: ["#21222c","#ff5555","#50fa7b","#f1fa8c","#bd93f9","#ff79c6","#8be9fd","#f8f8f2","#6272a4","#ff6e6e","#69ff94","#ffffa5","#d6acff","#ff92df","#a4ffff","#ffffff"],
  },
  catppuccin: {
    name: "Catppuccin Mocha", background: "#1e1e2e", foreground: "#cdd6f4", windowBar: "#181825",
    colors: ["#45475a","#f38ba8","#a6e3a1","#f9e2af","#89b4fa","#cba6f7","#94e2d5","#bac2de","#585b70","#f38ba8","#a6e3a1","#f9e2af","#89b4fa","#cba6f7","#94e2d5","#a6adc8"],
  },
  nord: {
    name: "Nord", background: "#2e3440", foreground: "#d8dee9", windowBar: "#242933",
    colors: ["#3b4252","#bf616a","#a3be8c","#ebcb8b","#81a1c1","#b48ead","#88c0d0","#e5e9f0","#4c566a","#bf616a","#a3be8c","#ebcb8b","#81a1c1","#b48ead","#8fbcbb","#eceff4"],
  },
  gruvbox: {
    name: "Gruvbox Dark", background: "#282828", foreground: "#ebdbb2", windowBar: "#1d2021",
    colors: ["#282828","#cc241d","#98971a","#d79921","#458588","#b16286","#689d6a","#a89984","#928374","#fb4934","#b8bb26","#fabd2f","#83a598","#d3869b","#8ec07c","#ebdbb2"],
  },
  light: {
    name: "Light", background: "#ffffff", foreground: "#383a42", windowBar: "#e8e8e8",
    colors: ["#383a42","#e45649","#50a14f","#c18401","#4078f2","#a626a4","#0184bc","#a0a1a7","#696c77","#e45649","#50a14f","#c18401","#4078f2","#a626a4","#0184bc","#383a42"],
  },
  "github-dark": {
    name: "GitHub Dark", background: "#0d1117", foreground: "#c9d1d9", windowBar: "#161b22",
    colors: ["#484f58","#ff7b72","#3fb950","#d29922","#58a6ff","#bc8cff","#39d353","#b1bac4","#6e7681","#ffa198","#56d364","#e3b341","#79c0ff","#d2a8ff","#56d364","#f0f6fc"],
  },
  "tokyo-night": {
    name: "Tokyo Night", background: "#1a1b26", foreground: "#a9b1d6", windowBar: "#16161e",
    colors: ["#32344a","#f7768e","#9ece6a","#e0af68","#7aa2f7","#ad8ee6","#449dab","#787c99","#444b6a","#ff7a93","#b9f27c","#ff9e64","#7da6ff","#bb9af7","#0db9d7","#acb0d0"],
  },
};

// ── Cast parser ─────────────────────────────────────────────────────

interface CastHeader { version: number; width: number; height: number; }
interface CastEvent { time: number; type: string; data: string; }
interface CastFile { header: CastHeader; events: CastEvent[]; }

function parseCast(content: string): CastFile {
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length === 0) throw new Error("Empty cast file");
  const header = JSON.parse(lines[0]);
  const events: CastEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = JSON.parse(lines[i]);
    events.push({ time: p[0], type: p[1], data: p[2] });
  }
  return { header, events };
}

// ── Terminal emulator ───────────────────────────────────────────────

interface Cell { char: string; fg: string; bg: string; bold: boolean; italic: boolean; underline: boolean; }

let COLORS: string[];
let FG: string;
let BG: string;

function setActiveTheme(t: Theme) { COLORS = t.colors; FG = t.foreground; BG = t.background; }

function emptyCell(): Cell {
  return { char: " ", fg: FG, bg: BG, bold: false, italic: false, underline: false };
}

function createScreen(w: number, h: number): Cell[][] {
  const cells: Cell[][] = [];
  for (let y = 0; y < h; y++) cells.push(Array.from({ length: w }, emptyCell));
  return cells;
}

function cloneScreen(s: Cell[][]): Cell[][] {
  return s.map(row => row.map(c => ({ ...c })));
}

function feed(cells: Cell[][], data: string, W: number, H: number, cx: number, cy: number): { cells: Cell[][]; cx: number; cy: number } {
  const s = cloneScreen(cells);
  let fg = FG, bg = BG, bold = false, italic = false, underline = false;
  let i = 0;

  function scroll() { s.shift(); s.push(Array.from({ length: W }, emptyCell)); }

  while (i < data.length) {
    const ch = data[i];
    if (ch === "\x1b" && data[i + 1] === "[") {
      i += 2;
      let params = "";
      while (i < data.length && data[i] >= "\x20" && data[i] <= "\x3f") { params += data[i]; i++; }
      const cmd = data[i] || ""; i++;
      if (cmd === "m") {
        const nums = params === "" ? [0] : params.split(";").map(n => parseInt(n) || 0);
        let j = 0;
        while (j < nums.length) {
          const c = nums[j];
          if (c === 0) { fg = FG; bg = BG; bold = false; italic = false; underline = false; }
          else if (c === 1) bold = true;
          else if (c === 3) italic = true;
          else if (c === 4) underline = true;
          else if (c === 22) bold = false;
          else if (c === 23) italic = false;
          else if (c === 24) underline = false;
          else if (c >= 30 && c <= 37) fg = COLORS[c - 30 + (bold ? 8 : 0)];
          else if (c === 38) {
            if (nums[j+1]===5) { fg = color256(nums[j+2]); j+=2; }
            else if (nums[j+1]===2) { fg = rgb(nums[j+2],nums[j+3],nums[j+4]); j+=4; }
          }
          else if (c === 39) fg = FG;
          else if (c >= 40 && c <= 47) bg = COLORS[c - 40];
          else if (c === 48) {
            if (nums[j+1]===5) { bg = color256(nums[j+2]); j+=2; }
            else if (nums[j+1]===2) { bg = rgb(nums[j+2],nums[j+3],nums[j+4]); j+=4; }
          }
          else if (c === 49) bg = BG;
          else if (c >= 90 && c <= 97) fg = COLORS[c - 90 + 8];
          else if (c >= 100 && c <= 107) bg = COLORS[c - 100 + 8];
          j++;
        }
      } else if (cmd === "H" || cmd === "f") {
        const n = params.split(";").map(n => parseInt(n) || 0);
        cy = Math.min(H-1, Math.max(0, (n[0]||1)-1));
        cx = Math.min(W-1, Math.max(0, (n[1]||1)-1));
      } else if (cmd === "A") cy = Math.max(0, cy - (parseInt(params)||1));
      else if (cmd === "B") cy = Math.min(H-1, cy + (parseInt(params)||1));
      else if (cmd === "C") cx = Math.min(W-1, cx + (parseInt(params)||1));
      else if (cmd === "D") cx = Math.max(0, cx - (parseInt(params)||1));
      else if (cmd === "J") {
        const n = parseInt(params) || 0;
        if (n === 0) { for (let x=cx;x<W;x++) s[cy][x]=emptyCell(); for(let y=cy+1;y<H;y++) for(let x=0;x<W;x++) s[y][x]=emptyCell(); }
        else if (n === 2 || n === 3) { for(let y=0;y<H;y++) for(let x=0;x<W;x++) s[y][x]=emptyCell(); }
      } else if (cmd === "K") {
        const n = parseInt(params) || 0;
        if (n===0) for(let x=cx;x<W;x++) s[cy][x]=emptyCell();
        else if (n===2) for(let x=0;x<W;x++) s[cy][x]=emptyCell();
      } else if (cmd === "G") cx = Math.min(W-1, Math.max(0, (parseInt(params)||1)-1));
      continue;
    }
    if (ch === "\x1b") { i += 2; continue; } // skip other ESC
    if (ch === "\r") { cx = 0; i++; continue; }
    if (ch === "\n") { cy++; if (cy >= H) { scroll(); cy = H-1; } i++; continue; }
    if (ch === "\t") { cx = Math.min((Math.floor(cx/8)+1)*8, W-1); i++; continue; }
    if (ch === "\b") { if (cx > 0) cx--; i++; continue; }
    if (ch.charCodeAt(0) < 32) { i++; continue; }
    if (cy >= 0 && cy < H && cx >= 0 && cx < W) {
      s[cy][cx] = { char: ch, fg, bg, bold, italic, underline };
      cx++;
      if (cx >= W) { cx = 0; cy++; if (cy >= H) { scroll(); cy = H-1; } }
    }
    i++;
  }
  return { cells: s, cx, cy };
}

function color256(n: number): string {
  if (n < 16) return COLORS[n];
  if (n >= 232) { const g = 8 + (n-232)*10; return rgb(g,g,g); }
  const idx = n-16, r = Math.floor(idx/36), g = Math.floor((idx%36)/6), b = idx%6;
  return rgb(r?r*40+55:0, g?g*40+55:0, b?b*40+55:0);
}

function rgb(r: number, g: number, b: number): string {
  return `#${((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)}`;
}

// ── SVG renderer ────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function renderSVG(cast: CastFile, theme: Theme, opts: { window: boolean; fontSize: number }): string {
  setActiveTheme(theme);
  const { width: W, height: H } = cast.header;
  const fontSize = opts.fontSize;
  const charW = fontSize * 0.6, rowH = fontSize * 1.35;
  const pad = 12, br = 8, winH = opts.window ? 36 : 0;
  const termW = W * charW + pad * 2, termH = H * rowH + pad * 2;
  const svgW = termW + 20, svgH = termH + winH + 20;

  // Build frames
  const merged: { time: number; data: string }[] = [];
  for (const e of cast.events) {
    if (e.type !== "o") continue;
    const last = merged[merged.length - 1];
    if (last && e.time - last.time < 0.016) last.data += e.data;
    else merged.push({ time: e.time, data: e.data });
  }

  const frames: { cells: Cell[][]; dur: number }[] = [];
  let cells = createScreen(W, H), cx = 0, cy = 0, lastT = 0;
  for (let i = 0; i < merged.length; i++) {
    const e = merged[i];
    const r = feed(cells, e.data, W, H, cx, cy);
    cells = r.cells; cx = r.cx; cy = r.cy;
    let t = e.time;
    if (t - lastT > 3) t = lastT + 3;
    const next = merged[i+1]?.time ?? t + 2;
    frames.push({ cells, dur: Math.min(next - t, 3) });
    lastT = t;
  }

  if (frames.length === 0) return "<svg></svg>";

  const totalDur = frames.reduce((s,f) => s + f.dur, 0) + 2;
  const font = "'JetBrains Mono','Fira Code','Cascadia Code','SF Mono','Menlo','Consolas',monospace";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `<style>\n.t{font-family:${font};font-size:${fontSize}px;white-space:pre}\n.b{font-weight:bold}\n.i{font-style:italic}\n.fr{opacity:0}\n`;

  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    const s1 = (acc / totalDur * 100), s2 = ((acc + frames[i].dur) / totalDur * 100);
    acc += frames[i].dur;
    svg += `@keyframes f${i}{0%,${Math.max(0,s1-.01).toFixed(2)}%{opacity:0}${s1.toFixed(2)}%,${s2.toFixed(2)}%{opacity:1}${Math.min(100,s2+.01).toFixed(2)}%,100%{opacity:0}}\n`;
    svg += `.f${i}{animation:f${i} ${totalDur.toFixed(2)}s infinite}\n`;
  }
  svg += `</style>\n`;

  svg += `<rect x="10" y="10" width="${termW}" height="${termH+winH}" rx="${br}" fill="${theme.background}"/>\n`;

  if (opts.window) {
    svg += `<g transform="translate(10,10)"><rect width="${termW}" height="${winH}" rx="${br}" fill="${theme.windowBar}"/>`;
    svg += `<rect y="${winH-br}" width="${termW}" height="${br}" fill="${theme.windowBar}"/>`;
    svg += `<circle cx="24" cy="${winH/2}" r="6" fill="#ff5f56"/><circle cx="44" cy="${winH/2}" r="6" fill="#ffbd2e"/><circle cx="64" cy="${winH/2}" r="6" fill="#27c93f"/></g>\n`;
  }

  const ox = 10 + pad, oy = 10 + winH + pad;
  for (let fi = 0; fi < frames.length; fi++) {
    svg += `<g class="fr f${fi}" transform="translate(${ox},${oy})">\n`;
    const c = frames[fi].cells;
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const cell = c[y][x];
        if (cell.char === " " && cell.bg === theme.background) { x++; continue; }
        let run = "", style = `${cell.fg}|${cell.bg}|${cell.bold}|${cell.italic}`;
        let rx = x;
        while (rx < W && `${c[y][rx].fg}|${c[y][rx].bg}|${c[y][rx].bold}|${c[y][rx].italic}` === style) {
          run += esc(c[y][rx].char); rx++;
        }
        const trimmed = run.replace(/\s+$/, "");
        if (trimmed) {
          if (cell.bg !== theme.background) svg += `<rect x="${x*charW}" y="${y*rowH}" width="${run.length*charW}" height="${rowH}" fill="${cell.bg}"/>\n`;
          let cls = "t"; if (cell.bold) cls += " b"; if (cell.italic) cls += " i";
          svg += `<text x="${x*charW}" y="${y*rowH+fontSize}" class="${cls}" fill="${cell.fg}">${trimmed}</text>\n`;
        }
        x = rx;
      }
    }
    svg += `</g>\n`;
  }
  svg += `</svg>`;
  return svg;
}

// ── UI ──────────────────────────────────────────────────────────────

const castInput = document.getElementById("castInput") as HTMLTextAreaElement;
const preview = document.getElementById("preview") as HTMLDivElement;
const themeSelect = document.getElementById("themeSelect") as HTMLSelectElement;
const fontSizeSelect = document.getElementById("fontSizeSelect") as HTMLSelectElement;
const windowChrome = document.getElementById("windowChrome") as HTMLInputElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const dropZone = document.getElementById("dropZone") as HTMLDivElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const eventCount = document.getElementById("eventCount") as HTMLSpanElement;
const svgSize = document.getElementById("svgSize") as HTMLSpanElement;

let currentSVG = "";

// Populate theme select
for (const [id, theme] of Object.entries(themes)) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = theme.name;
  themeSelect.appendChild(opt);
}

function render() {
  const text = castInput.value.trim();
  if (!text) {
    preview.innerHTML = '<div class="placeholder">SVG preview will appear here</div>';
    downloadBtn.disabled = true;
    eventCount.textContent = "0 events";
    svgSize.textContent = "-";
    return;
  }

  try {
    const cast = parseCast(text);
    const theme = themes[themeSelect.value] || themes["one-dark"];
    const svg = renderSVG(cast, theme, {
      window: windowChrome.checked,
      fontSize: parseInt(fontSizeSelect.value),
    });

    currentSVG = svg;
    preview.innerHTML = svg;
    downloadBtn.disabled = false;
    eventCount.textContent = `${cast.events.length} events`;
    svgSize.textContent = `${(svg.length / 1024).toFixed(1)} KB`;
  } catch (e: any) {
    preview.innerHTML = `<div class="placeholder" style="color:#ff7b72">Error: ${e.message}</div>`;
    downloadBtn.disabled = true;
  }
}

// Debounce input
let timeout: number;
castInput.addEventListener("input", () => {
  clearTimeout(timeout);
  timeout = setTimeout(render, 300) as unknown as number;
});

themeSelect.addEventListener("change", render);
fontSizeSelect.addEventListener("change", render);
windowChrome.addEventListener("change", render);

// Download
downloadBtn.addEventListener("click", () => {
  if (!currentSVG) return;
  const blob = new Blob([currentSVG], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "termsnap.svg";
  a.click();
  URL.revokeObjectURL(url);
});

// Drop zone
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("active"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("active"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("active");
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
});

function loadFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    castInput.value = reader.result as string;
    render();
  };
  reader.readAsText(file);
}
