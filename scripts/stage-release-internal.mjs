// After `tauri build`, make sure the PyInstaller `_internal` directory is
// present next to the release exe so the sidecar can find python314.dll when
// the app is run directly from `src-tauri/target/release` (bare exe, no NSIS
// install). Installed NSIS builds deploy `_internal` themselves.
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const releaseDir = join(workspace, "src-tauri", "target", "release");
const sourceInternal = join(workspace, "src-tauri", "binaries", "_internal");
const targetInternal = join(releaseDir, "_internal");

if (!existsSync(sourceInternal)) {
  console.warn("stage-release-internal: no src-tauri/binaries/_internal to copy; skipping.");
  process.exit(0);
}

rmSync(targetInternal, { recursive: true, force: true });
cpSync(sourceInternal, targetInternal, { recursive: true });
console.log(`Staged _internal -> ${targetInternal}`);
