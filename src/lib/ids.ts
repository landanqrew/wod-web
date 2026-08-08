import { randomUUID } from "node:crypto";

/** Short, readable, prefixed ids — mirrors the CLI's `wod_…` style. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
