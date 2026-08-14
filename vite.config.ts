import { readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { Connect, Plugin } from "vite-plus";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";

const researchRoot = resolve(process.cwd(), "research-assets");
const researchRoute = "/__research/";

const contentTypes: Record<string, string> = {
  ".atlas": "text/plain",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".skel": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
};

function serveResearchAsset(
  request: Connect.IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
) {
  const pathname = request.url?.split("?", 1)[0];
  if (!pathname?.startsWith(researchRoute)) {
    next();
    return;
  }

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname.slice(researchRoute.length));
  } catch {
    response.statusCode = 400;
    response.end("Invalid asset path");
    return;
  }

  const assetPath = resolve(researchRoot, relativePath);
  if (!assetPath.startsWith(`${researchRoot}${sep}`)) {
    response.statusCode = 403;
    response.end("Asset path is outside the research directory");
    return;
  }

  void stat(assetPath)
    .then((assetStat) => {
      if (!assetStat.isFile()) {
        throw new Error("Not a file");
      }
      return readFile(assetPath);
    })
    .then((contents) => {
      response.statusCode = 200;
      response.setHeader(
        "Content-Type",
        contentTypes[extname(assetPath).toLowerCase()] ?? "application/octet-stream",
      );
      response.setHeader("Cache-Control", "no-cache");
      response.end(contents);
    })
    .catch(() => {
      response.statusCode = 404;
      response.end("Research asset not found");
    });
}

function localResearchAssets(): Plugin {
  return {
    name: "local-research-assets",
    configureServer(server) {
      server.middlewares.use(serveResearchAsset);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveResearchAsset);
    },
  };
}

export default defineConfig({
  plugins: [react(), localResearchAssets()],
  server: {
    host: "127.0.0.1",
  },
  fmt: {
    ignorePatterns: [
      "backend/**",
      "docs/**",
      "schemas/openapi.json",
      "src/api/generated/**",
      "src-tauri/gen/**",
      ".firecrawl/**",
    ],
  },
  lint: {
    ignorePatterns: ["src/api/generated/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
