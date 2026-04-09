# termsnap

> Record terminal sessions and export beautiful animated SVGs. One tool, two commands.

<p align="center">
  <img src="demo.svg" alt="termsnap demo" width="700">
</p>

The current tools for creating terminal recordings are either too complex (chain asciinema + svg-term-cli), require learning a config language (vhs tape files), or produce blurry GIFs. **termsnap** does it all in two commands with sharp, animated SVG output that renders natively on GitHub.

## Usage

```bash
# Record your terminal (type exit or Ctrl+D to stop)
termsnap record -o demo.cast

# Export to animated SVG
termsnap export demo.cast -o demo.svg

# Or do both in one step
termsnap snap -o demo.svg
```

That's it. Drop the SVG in your README and it just works.

## Install

```bash
git clone https://github.com/CuteAnimeGirl1337/termsnap.git
cd termsnap
bun install
```

Run directly:
```bash
bun src/index.ts record -o demo.cast
bun src/index.ts export demo.cast -o demo.svg
```

The first run auto-compiles a small C helper for terminal capture (requires `gcc`).

## Commands

### `termsnap record`

Records your terminal session into a `.cast` file (asciicast v2 format — compatible with asciinema).

```bash
termsnap record -o demo.cast          # Default 80x24
termsnap record -o demo.cast -c 120 -r 30  # Custom size
termsnap record -o demo.cast -s fish  # Use a specific shell
```

### `termsnap export`

Converts a `.cast` file into an animated SVG.

```bash
termsnap export demo.cast                    # Output: demo.svg
termsnap export demo.cast -o output.svg      # Custom output path
termsnap export demo.cast --no-window        # No window chrome
termsnap export demo.cast --still            # Static screenshot (last frame only)
termsnap export demo.cast --font-size 16     # Larger text
```

### `termsnap snap`

Record + export in one step. Opens a shell, and when you're done, outputs an SVG directly.

```bash
termsnap snap -o demo.svg
```

## Output

- Animated SVG with CSS keyframes (no JS)
- macOS-style window chrome with traffic light buttons
- One Dark color theme with full 256-color + RGB support
- Monospace font stack (JetBrains Mono, Fira Code, Cascadia Code, etc.)
- Renders natively on GitHub, GitLab, and any browser

## How it works

1. A small C program spawns a pseudo-terminal (PTY) and captures all output with microsecond timestamps
2. A TypeScript ANSI parser emulates the terminal state (colors, cursor movement, screen clearing)
3. An SVG renderer converts each frame into vector text with CSS animations

No Electron, no headless browser, no screen recording. Pure text-to-SVG.

## Requirements

- [Bun](https://bun.sh)
- `gcc` (for compiling the PTY helper on first run)
- Linux or macOS

## License

MIT
