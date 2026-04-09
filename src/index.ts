#!/usr/bin/env bun
import { program } from "commander";
import chalk from "chalk";
import { record } from "./recorder.js";
import { parseCast, writeCast } from "./cast.js";
import { renderSVG, renderStillSVG } from "./renderer.js";

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
    console.log(chalk.green(`\n  ✓ Saved to ${opts.output}`) + chalk.dim(` (${cast.events.length} events)`));
  });

program
  .command("export")
  .description("Export a recording to SVG")
  .argument("<input>", "Input .cast file")
  .option("-o, --output <file>", "Output SVG file")
  .option("--no-window", "Hide window chrome (traffic light buttons)")
  .option("--still", "Export last frame only (no animation)")
  .option("--font-size <px>", "Font size in pixels", "14")
  .option("--cols <number>", "Override terminal width")
  .option("--rows <number>", "Override terminal height")
  .action(async (input, opts) => {
    const file = Bun.file(input);
    if (!(await file.exists())) {
      console.error(chalk.red(`  ✗ File not found: ${input}`));
      process.exit(1);
    }

    const content = await file.text();
    const cast = parseCast(content);

    // Override dimensions if specified
    if (opts.cols) cast.header.width = parseInt(opts.cols);
    if (opts.rows) cast.header.height = parseInt(opts.rows);

    const outputFile = opts.output ?? input.replace(/\.cast$/, ".svg");

    const svg = opts.still
      ? renderStillSVG(cast, { window: opts.window, fontSize: parseInt(opts.fontSize) })
      : renderSVG(cast, { window: opts.window, fontSize: parseInt(opts.fontSize) });

    await Bun.write(outputFile, svg);

    const size = (svg.length / 1024).toFixed(1);
    console.log(chalk.green(`  ✓ Exported to ${outputFile}`) + chalk.dim(` (${size} KB)`));
  });

// Shortcut: record + export in one command
program
  .command("snap")
  .description("Record and export to SVG in one step")
  .option("-o, --output <file>", "Output SVG file", "termsnap.svg")
  .option("-c, --cols <number>", "Terminal width", "80")
  .option("-r, --rows <number>", "Terminal height", "24")
  .option("--no-window", "Hide window chrome")
  .action(async (opts) => {
    const cast = await record({
      cols: parseInt(opts.cols),
      rows: parseInt(opts.rows),
    });

    const svg = renderSVG(cast, { window: opts.window });
    await Bun.write(opts.output, svg);

    const size = (svg.length / 1024).toFixed(1);
    console.log(chalk.green(`\n  ✓ Exported to ${opts.output}`) + chalk.dim(` (${size} KB)`));
  });

program.parse();
