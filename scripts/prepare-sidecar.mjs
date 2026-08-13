import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const backend = join(workspace, "backend");
const sourceDirectory = join(backend, "dist", "neoarchive-api");
const binariesDirectory = join(workspace, "src-tauri", "binaries");

execFileSync(
  "uv",
  [
    "run",
    "--project",
    backend,
    "pyinstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--name",
    "neoarchive-api",
    "--distpath",
    join(backend, "dist"),
    "--workpath",
    join(backend, "build"),
    "--specpath",
    join(backend, "build"),
    "--paths",
    join(backend, "src"),
    "--hidden-import",
    "neoarchive.main",
    "--collect-data",
    "neoarchive",
    join(backend, "src", "neoarchive", "sidecar.py"),
  ],
  { cwd: workspace, stdio: "inherit" },
);

const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
const executableName = process.platform === "win32" ? "neoarchive-api.exe" : "neoarchive-api";
const targetName =
  process.platform === "win32"
    ? `neoarchive-api-${targetTriple}.exe`
    : `neoarchive-api-${targetTriple}`;
const sourceExecutable = join(sourceDirectory, executableName);

if (!existsSync(sourceExecutable)) {
  throw new Error(`PyInstaller output was not found: ${sourceExecutable}`);
}

mkdirSync(binariesDirectory, { recursive: true });
rmSync(join(binariesDirectory, "_internal"), { recursive: true, force: true });
cpSync(sourceExecutable, join(binariesDirectory, targetName));
cpSync(join(sourceDirectory, "_internal"), join(binariesDirectory, "_internal"), {
  recursive: true,
});

process.stdout.write(`Prepared ${targetName}\n`);
