#!/usr/bin/env bun
import { program } from "commander";
import chalk from "chalk";
import { record } from "./recorder.js";
import { parseCast, writeCast } from "./cast.js";
import { renderSVG, renderStillSVG } from "./renderer.js";
import { getTheme, listThemes, themes } from "./themes.js";

program
  .name("termsnap")
  .description("Record terminal sessions and export beautiful animated SVGs")
  .version("1.0.0");

program
  .command("record")
  .description("Record a terminal session")
  .option("-o, --output <file>", "Output file", "recording.cast")
  .option("-c, --cols <number>", "Terminal width in columns", "80")
  .option("-r, --rows <number>", "Terminal height in rows", "24")
  .option("-s, --shell <path>", "Shell to use")
  .action(async (opts) => {
    const cast = await record({
      cols: parseInt(opts.cols),
      rows: parseInt(opts.rows),
      shell: opts.shell,
    });

    const content = writeCast(cast);
    await Bun.write(opts.output, content);
    console.log(chalk.green(`\n  Saved to ${opts.output}`) + chalk.dim(` (${cast.events.length} events)`));
  });

program
  .command("export")
  .description("Export a recording to SVG")
  .argument("<input>", "Input .cast file")
  .option("-o, --output <file>", "Output SVG file")
  .option("-t, --theme <name>", "Color theme", "one-dark")
  .option("--no-window", "Hide window chrome (traffic light buttons)")
  .option("--still", "Export last frame only (no animation)")
  .option("--font-size <px>", "Font size in pixels", "14")
  .option("--cols <number>", "Override terminal width")
  .option("--rows <number>", "Override terminal height")
  .option("--speed <multiplier>", "Playback speed multiplier (2 = 2x faster)", "1")
  .option("--max-idle <seconds>", "Cap max pause between frames in seconds", "3")
  .option("--title <text>", "Window title bar text")
  .option("--crop", "Trim empty rows from bottom of terminal")
  .action(async (input, opts) => {
    const file = Bun.file(input);
    if (!(await file.exists())) {
      console.error(chalk.red(`  File not found: ${input}`));
      process.exit(1);
    }

    const theme = getTheme(opts.theme);
    const content = await file.text();
    const cast = parseCast(content);

    if (opts.cols) cast.header.width = parseInt(opts.cols);
    if (opts.rows) cast.header.height = parseInt(opts.rows);

    const outputFile = opts.output ?? input.replace(/\.cast$/, ".svg");

    const renderOpts = {
      window: opts.window,
      fontSize: parseInt(opts.fontSize),
      theme,
      speed: parseFloat(opts.speed),
      maxIdle: parseFloat(opts.maxIdle),
      title: opts.title,
      crop: opts.crop ?? false,
    };

    const svg = opts.still
      ? renderStillSVG(cast, renderOpts)
      : renderSVG(cast, renderOpts);

    await Bun.write(outputFile, svg);

    const size = (svg.length / 1024).toFixed(1);
    console.log(chalk.green(`  Exported to ${outputFile}`) + chalk.dim(` (${size} KB, theme: ${theme.name})`));
  });

program
  .command("snap")
  .description("Record and export to SVG in one step")
  .option("-o, --output <file>", "Output SVG file", "termsnap.svg")
  .option("-c, --cols <number>", "Terminal width", "80")
  .option("-r, --rows <number>", "Terminal height", "24")
  .option("-t, --theme <name>", "Color theme", "one-dark")
  .option("--no-window", "Hide window chrome")
  .option("--speed <multiplier>", "Playback speed multiplier", "1")
  .option("--max-idle <seconds>", "Cap max pause between frames in seconds", "3")
  .option("--title <text>", "Window title bar text")
  .action(async (opts) => {
    const theme = getTheme(opts.theme);
    const cast = await record({
      cols: parseInt(opts.cols),
      rows: parseInt(opts.rows),
    });

    const svg = renderSVG(cast, {
      window: opts.window,
      theme,
      speed: parseFloat(opts.speed),
      maxIdle: parseFloat(opts.maxIdle),
      title: opts.title,
    });
    await Bun.write(opts.output, svg);

    const size = (svg.length / 1024).toFixed(1);
    console.log(chalk.green(`\n  Exported to ${opts.output}`) + chalk.dim(` (${size} KB, theme: ${theme.name})`));
  });

program
  .command("preview")
  .description("Play back a .cast file in the terminal (like asciinema play)")
  .argument("<input>", "Input .cast file")
  .option("--speed <multiplier>", "Playback speed multiplier", "1")
  .option("--max-idle <seconds>", "Cap max pause between frames in seconds", "3")
  .action(async (input, opts) => {
    const file = Bun.file(input);
    if (!(await file.exists())) {
      console.error(chalk.red(`  File not found: ${input}`));
      process.exit(1);
    }

    const content = await file.text();
    const cast = parseCast(content);
    const speed = parseFloat(opts.speed);
    const maxIdle = parseFloat(opts.maxIdle);

    const outputEvents = cast.events.filter((e) => e.type === "o");
    if (outputEvents.length === 0) {
      console.error(chalk.red("  No output events in this recording."));
      process.exit(1);
    }

    const duration = outputEvents[outputEvents.length - 1].time;
    console.log(
      chalk.dim(`  Playing ${input}`) +
      chalk.dim(` (${outputEvents.length} events, ${duration.toFixed(1)}s, ${speed}x speed)`)
    );
    console.log(chalk.dim("  Press Ctrl+C to stop\n"));

    let lastTime = 0;
    for (const event of outputEvents) {
      let delay = event.time - lastTime;
      if (delay > maxIdle) delay = maxIdle;
      if (speed > 0 && speed !== 1) delay = delay / speed;

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      }

      process.stdout.write(event.data);
      lastTime = event.time;
    }

    console.log(chalk.dim("\n\n  Playback finished."));
  });

program
  .command("themes")
  .description("List available color themes")
  .action(() => {
    console.log(chalk.bold("\n  Available themes:\n"));
    for (const [id, theme] of Object.entries(themes)) {
      const swatch = theme.colors.slice(1, 7).map((c) => chalk.hex(c)("██")).join("");
      console.log(`  ${chalk.bold(id.padEnd(16))} ${theme.name.padEnd(20)} ${swatch}  ${chalk.dim(theme.background)}`);
    }
    console.log(chalk.dim(`\n  Usage: termsnap export demo.cast --theme dracula\n`));
  });

program.parse();
