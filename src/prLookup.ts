/**
 * Pull-Request / Merge-Request lookup (v0.4).
 *
 * Queries the GitHub or GitLab API to find the PR/MR associated with a
 * specific commit SHA, then returns the URL so the user can open it.
 *
 * Security:
 *  - SHA is validated with isValidSha() before constructing any URL.
 *  - The GitHub token is read from VSCode SecretStorage (never from BlameConfig).
 *  - Only https:// API endpoints are called.
 *  - No credentials are logged or included in error messages.
 */

import * as https from "https";
import type { RemoteInfo } from "./types";
import { isValidSha } from "./gitBlame";

// ---------------------------------------------------------------------------
// Internal HTTP helper — uses Node's built-in https (no external deps)
// ---------------------------------------------------------------------------

interface HttpResponse {
  statusCode: number;
  body: string;
}

function httpsGet(url: string, headers: Record<string, string>): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      reject(new Error("prLookup: only https URLs are allowed"));
      return;
    }
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": "CursorBlame-Extension/1.0",
        Accept: "application/vnd.github+json",
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(new Error("prLookup: request timed out")); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Provider-specific lookups
// ---------------------------------------------------------------------------

/**
 * Look up the GitHub PR URL for a commit SHA.
 *
 * @param baseUrl  Normalised repo URL, e.g. https://github.com/owner/repo
 * @param sha      Validated 40-char commit SHA
 * @param token    GitHub personal access token (optional but recommended to
 *                 avoid hitting the 60 req/h unauthenticated rate limit)
 * @returns        PR URL string, or null if not found / on error
 */
export async function lookupGitHubPr(
  baseUrl: string,
  sha: string,
  token?: string
): Promise<string | null> {
  if (!isValidSha(sha)) {
    return null;
  }
  // Extract owner/repo from the normalised https://github.com/owner/repo URL
  const match = baseUrl.match(/https:\/\/github\.com\/([^/]+\/[^/]+)$/);
  if (!match) {
    return null;
  }
  const repoPath = match[1];
  const apiUrl = `https://api.github.com/repos/${repoPath}/commits/${sha}/pulls`;

  const headers: Record<string, string> = {};
  if (token) {
    // Never log the token — reference it only in the Authorization header
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await httpsGet(apiUrl, headers);
    if (response.statusCode !== 200) {
      return null;
    }
    const pulls = JSON.parse(response.body) as Array<{ html_url: string }>;
    if (Array.isArray(pulls) && pulls.length > 0 && typeof pulls[0].html_url === "string") {
      const url = pulls[0].html_url;
      // Safety check: only return https URLs
      return url.startsWith("https://") ? url : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Look up the GitLab MR URL for a commit SHA.
 *
 * @param baseUrl  Normalised repo URL, e.g. https://gitlab.com/owner/repo
 * @param sha      Validated 40-char commit SHA
 * @param token    GitLab personal access token (optional)
 * @returns        MR URL string, or null if not found / on error
 */
export async function lookupGitLabMr(
  baseUrl: string,
  sha: string,
  token?: string
): Promise<string | null> {
  if (!isValidSha(sha)) {
    return null;
  }
  // Extract the project path portion after the host
  const match = baseUrl.match(/https:\/\/[^/]+\/(.+)$/);
  if (!match) {
    return null;
  }
  const projectPath = encodeURIComponent(match[1]);
  const hostMatch = baseUrl.match(/^https:\/\/([^/]+)/);
  if (!hostMatch) {
    return null;
  }
  const host = hostMatch[1];
  const apiUrl = `https://${host}/api/v4/projects/${projectPath}/repository/commits/${sha}/merge_requests`;

  const headers: Record<string, string> = {};
  if (token) {
    headers["PRIVATE-TOKEN"] = token;
  }

  try {
    const response = await httpsGet(apiUrl, headers);
    if (response.statusCode !== 200) {
      return null;
    }
    const mrs = JSON.parse(response.body) as Array<{ web_url: string }>;
    if (Array.isArray(mrs) && mrs.length > 0 && typeof mrs[0].web_url === "string") {
      const url = mrs[0].web_url;
      return url.startsWith("https://") ? url : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Dispatcher: look up the PR/MR URL for a commit based on the remote provider.
 * Returns null for unsupported providers (Bitbucket, Azure, unknown).
 *
 * @param remoteInfo  Remote provider information.
 * @param sha         Commit SHA (will be validated internally).
 * @param token       Optional API token from SecretStorage.
 */
export async function lookupPr(
  remoteInfo: RemoteInfo,
  sha: string,
  token?: string
): Promise<string | null> {
  if (!isValidSha(sha)) {
    return null;
  }
  switch (remoteInfo.provider) {
    case "github":
      return lookupGitHubPr(remoteInfo.commitUrlTemplate, sha, token);
    case "gitlab":
      return lookupGitLabMr(remoteInfo.commitUrlTemplate, sha, token);
    default:
      return null;
  }
}
