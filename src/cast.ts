/**
 * Asciicast v2 format — simple JSONL.
 * Line 1: header JSON { version, width, height, timestamp }
 * Lines 2+: [time, "o", data] events
 */

export interface CastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp: number;
  title?: string;
  env?: Record<string, string>;
}

export interface CastEvent {
  time: number;
  type: "o" | "i"; // output or input
  data: string;
}

export interface CastFile {
  header: CastHeader;
  events: CastEvent[];
}

export function parseCast(content: string): CastFile {
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length === 0) throw new Error("Empty cast file");

  const header: CastHeader = JSON.parse(lines[0]);
  const events: CastEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parsed = JSON.parse(lines[i]);
    events.push({
      time: parsed[0],
      type: parsed[1],
      data: parsed[2],
    });
  }

  return { header, events };
}

export function writeCast(cast: CastFile): string {
  const lines: string[] = [JSON.stringify(cast.header)];
  for (const event of cast.events) {
    lines.push(JSON.stringify([event.time, event.type, event.data]));
  }
  return lines.join("\n") + "\n";
}
