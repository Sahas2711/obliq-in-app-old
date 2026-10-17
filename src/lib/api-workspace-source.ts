import type { WorkspaceData, WorkspaceSource } from "@/types/workspace";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// Calls the backend in src/app/api/workspace. Each method throws on a failed
// request so forms keep their input and the timer keeps its duration.
export function createApiWorkspace(
  request: Fetch = (url, init) => fetch(url, init),
): WorkspaceSource {
  async function call(path: string, body?: unknown) {
    const response = await request(
      `/api/workspace${path}`,
      body === undefined
        ? { cache: "no-store" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as WorkspaceData;
  }
  return {
    load: () => call(""),
    create: (kind, values) => call("/records", { kind, values }),
    saveTime: (project, seconds) => call("/time", { project, seconds }),
  };
}
