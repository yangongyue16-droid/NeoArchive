export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
  database: string;
  capabilities: string[];
};

import type { StoryProject } from "../project-schema/types";

export type ProjectDiagnostic = {
  severity: "error" | "warning";
  code: string;
  message: string;
  pointer: string;
};

export type ProjectSummary = {
  projectId: string;
  title: string;
  schemaVersion: number;
  updatedAt: string;
  revision: string;
};

export type ProjectDocument = {
  project: StoryProject;
  revision: string;
  diagnostics: ProjectDiagnostic[];
};

export type ProjectValidation = {
  valid: boolean;
  diagnostics: ProjectDiagnostic[];
};

export type ProjectExport = {
  projectId: string;
  artifactName: string;
  path: string;
  sizeBytes: number;
  revision: string;
};

export class BackendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

type BackendConnection = {
  baseUrl: string;
  sessionToken: string | null;
};

declare global {
  interface Window {
    __NEOARCHIVE_API_URL__?: string;
    __NEOARCHIVE_SESSION_TOKEN__?: string;
  }
}

let connectionPromise: Promise<BackendConnection> | null = null;

function getBackendConnection(): Promise<BackendConnection> {
  if (connectionPromise) {
    return connectionPromise;
  }
  connectionPromise = (async () => {
    if (window.__NEOARCHIVE_API_URL__) {
      return {
        baseUrl: window.__NEOARCHIVE_API_URL__,
        sessionToken: window.__NEOARCHIVE_SESSION_TOKEN__ ?? null,
      };
    }
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<BackendConnection>("backend_connection");
    }
    return {
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8765/api/v1",
      sessionToken: null,
    };
  })();
  return connectionPromise;
}

async function requestBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const connection = await getBackendConnection();
  const headers = new Headers(init?.headers);
  if (connection.sessionToken) {
    headers.set("Authorization", `Bearer ${connection.sessionToken}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(4_000),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string | { code?: string; message?: string };
    } | null;
    const detail = payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : (detail?.message ?? `Python 服务请求失败（${response.status}）`);
    throw new BackendApiError(
      message,
      response.status,
      typeof detail === "object" ? detail.code : undefined,
    );
  }
  return response.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthResponse> {
  return requestBackend<HealthResponse>("/health", { signal: AbortSignal.timeout(1_200) });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return requestBackend<ProjectSummary[]>("/projects");
}

export async function openProject(projectId: string): Promise<ProjectDocument> {
  return requestBackend<ProjectDocument>(`/projects/${encodeURIComponent(projectId)}`);
}

export async function saveProject(
  project: StoryProject,
  revision?: string,
): Promise<ProjectDocument> {
  return requestBackend<ProjectDocument>(`/projects/${encodeURIComponent(project.projectId)}`, {
    method: "PUT",
    body: JSON.stringify({ project, revision }),
  });
}

export async function validateProject(project: StoryProject): Promise<ProjectValidation> {
  return requestBackend<ProjectValidation>("/projects/validate", {
    method: "POST",
    body: JSON.stringify(project),
  });
}

export async function exportProject(projectId: string): Promise<ProjectExport> {
  return requestBackend<ProjectExport>(`/projects/${encodeURIComponent(projectId)}/export`, {
    method: "POST",
  });
}
