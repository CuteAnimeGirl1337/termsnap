export interface Theme {
  name: string;
  background: string;
  foreground: string;
  windowBar: string;
  colors: string[]; // 16 ANSI colors (8 normal + 8 bright)
}

export const themes: Record<string, Theme> = {
  "one-dark": {
    name: "One Dark",
    background: "#282c34",
    foreground: "#abb2bf",
    windowBar: "#21252b",
    colors: [
      "#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
      "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff",
    ],
  },

  dracula: {
    name: "Dracula",
    background: "#282a36",
    foreground: "#f8f8f2",
    windowBar: "#1e1f29",
    colors: [
      "#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
      "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
    ],
  },

  catppuccin: {
    name: "Catppuccin Mocha",
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    windowBar: "#181825",
    colors: [
      "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7", "#94e2d5", "#bac2de",
      "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7", "#94e2d5", "#a6adc8",
    ],
  },

  nord: {
    name: "Nord",
    background: "#2e3440",
    foreground: "#d8dee9",
    windowBar: "#242933",
    colors: [
      "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
      "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
    ],
  },

  gruvbox: {
    name: "Gruvbox Dark",
    background: "#282828",
    foreground: "#ebdbb2",
    windowBar: "#1d2021",
    colors: [
      "#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984",
      "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2",
    ],
  },

  light: {
    name: "Light",
    background: "#ffffff",
    foreground: "#383a42",
    windowBar: "#e8e8e8",
    colors: [
      "#383a42", "#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4", "#0184bc", "#a0a1a7",
      "#696c77", "#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4", "#0184bc", "#383a42",
    ],
  },

  "github-dark": {
    name: "GitHub Dark",
    background: "#0d1117",
    foreground: "#c9d1d9",
    windowBar: "#161b22",
    colors: [
      "#484f58", "#ff7b72", "#3fb950", "#d29922", "#58a6ff", "#bc8cff", "#39d353", "#b1bac4",
      "#6e7681", "#ffa198", "#56d364", "#e3b341", "#79c0ff", "#d2a8ff", "#56d364", "#f0f6fc",
    ],
  },

  "tokyo-night": {
    name: "Tokyo Night",
    background: "#1a1b26",
    foreground: "#a9b1d6",
    windowBar: "#16161e",
    colors: [
      "#32344a", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#ad8ee6", "#449dab", "#787c99",
      "#444b6a", "#ff7a93", "#b9f27c", "#ff9e64", "#7da6ff", "#bb9af7", "#0db9d7", "#acb0d0",
    ],
  },
};

export function getTheme(name: string): Theme {
  const theme = themes[name];
  if (!theme) {
    const available = Object.keys(themes).join(", ");
    throw new Error(`Unknown theme: "${name}". Available: ${available}`);
  }
  return theme;
}

export function listThemes(): string[] {
  return Object.keys(themes);
}
