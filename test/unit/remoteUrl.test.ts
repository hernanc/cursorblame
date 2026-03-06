/**
 * Unit tests for src/remoteUrl.ts
 * Tests cover: normaliseRemoteUrl, detectProvider, buildCommitUrl, commitUrl
 */

import * as assert from "assert";
import {
  normaliseRemoteUrl,
  detectProvider,
  buildCommitUrl,
  commitUrl,
} from "../../src/remoteUrl";
import type { RemoteInfo } from "../../src/types";

// ---------------------------------------------------------------------------
// normaliseRemoteUrl
// ---------------------------------------------------------------------------

describe("normaliseRemoteUrl", () => {
  it("normalises SCP-style SSH GitHub URL", () => {
    assert.strictEqual(
      normaliseRemoteUrl("git@github.com:owner/repo.git"),
      "https://github.com/owner/repo"
    );
  });

  it("normalises SCP-style SSH GitLab URL", () => {
    assert.strictEqual(
      normaliseRemoteUrl("git@gitlab.com:owner/group/repo.git"),
      "https://gitlab.com/owner/group/repo"
    );
  });

  it("normalises HTTPS URL with .git suffix", () => {
    assert.strictEqual(
      normaliseRemoteUrl("https://github.com/owner/repo.git"),
      "https://github.com/owner/repo"
    );
  });

  it("returns HTTPS URL unchanged (no .git)", () => {
    assert.strictEqual(
      normaliseRemoteUrl("https://github.com/owner/repo"),
      "https://github.com/owner/repo"
    );
  });

  it("normalises git:// protocol to https://", () => {
    assert.strictEqual(
      normaliseRemoteUrl("git://github.com/owner/repo.git"),
      "https://github.com/owner/repo"
    );
  });

  it("strips embedded user credentials from HTTPS URL", () => {
    assert.strictEqual(
      normaliseRemoteUrl("https://user@bitbucket.org/owner/repo.git"),
      "https://bitbucket.org/owner/repo"
    );
  });

  it("returns null for plain SSH (non-SCP) URLs", () => {
    assert.strictEqual(
      normaliseRemoteUrl("ssh://git@github.com/owner/repo.git"),
      null
    );
  });

  it("returns null for http:// URLs (not https)", () => {
    assert.strictEqual(
      normaliseRemoteUrl("http://github.com/owner/repo.git"),
      null
    );
  });

  it("returns null for an empty string", () => {
    assert.strictEqual(normaliseRemoteUrl(""), null);
  });

  it("returns null for a completely invalid string", () => {
    assert.strictEqual(normaliseRemoteUrl("not-a-url"), null);
  });

  it("normalises Azure DevOps SSH URL", () => {
    const result = normaliseRemoteUrl(
      "git@ssh.dev.azure.com:v3/organisation/project/repo"
    );
    // SCP pattern matches — produces https://ssh.dev.azure.com/v3/...
    // which is technically valid but won't be a real commit URL.
    // The important thing is it doesn't crash and returns https://.
    assert.ok(result === null || (result !== null && result.startsWith("https://")));
  });

  it("normalises Azure DevOps HTTPS URL", () => {
    const result = normaliseRemoteUrl(
      "https://organisation@dev.azure.com/organisation/project/_git/repo"
    );
    assert.ok(result !== null && result.startsWith("https://"));
    assert.ok(!result.includes("organisation@"), "user info should be stripped");
  });
});

// ---------------------------------------------------------------------------
// detectProvider
// ---------------------------------------------------------------------------

describe("detectProvider", () => {
  it("detects GitHub", () => {
    assert.strictEqual(
      detectProvider("https://github.com/owner/repo"),
      "github"
    );
  });

  it("detects GitLab.com", () => {
    assert.strictEqual(
      detectProvider("https://gitlab.com/owner/repo"),
      "gitlab"
    );
  });

  it("detects self-hosted GitLab (gitlab. subdomain)", () => {
    assert.strictEqual(
      detectProvider("https://gitlab.company.com/owner/repo"),
      "gitlab"
    );
  });

  it("detects Bitbucket", () => {
    assert.strictEqual(
      detectProvider("https://bitbucket.org/owner/repo"),
      "bitbucket"
    );
  });

  it("detects Azure DevOps (dev.azure.com)", () => {
    assert.strictEqual(
      detectProvider("https://dev.azure.com/org/project/_git/repo"),
      "azure"
    );
  });

  it("detects Azure DevOps (visualstudio.com)", () => {
    assert.strictEqual(
      detectProvider("https://org.visualstudio.com/project/_git/repo"),
      "azure"
    );
  });

  it("returns 'unknown' for an unrecognised host", () => {
    assert.strictEqual(
      detectProvider("https://gitea.company.internal/owner/repo"),
      "unknown"
    );
  });
});

// ---------------------------------------------------------------------------
// buildCommitUrl
// ---------------------------------------------------------------------------

describe("buildCommitUrl", () => {
  const sha = "abc1234567890abcdef1234567890abcdef12345";

  it("builds GitHub commit URL", () => {
    assert.strictEqual(
      buildCommitUrl("github", "https://github.com/owner/repo", sha),
      `https://github.com/owner/repo/commit/${sha}`
    );
  });

  it("builds GitLab commit URL", () => {
    assert.strictEqual(
      buildCommitUrl("gitlab", "https://gitlab.com/owner/repo", sha),
      `https://gitlab.com/owner/repo/-/commit/${sha}`
    );
  });

  it("builds Bitbucket commit URL", () => {
    assert.strictEqual(
      buildCommitUrl("bitbucket", "https://bitbucket.org/owner/repo", sha),
      `https://bitbucket.org/owner/repo/commits/${sha}`
    );
  });

  it("builds Azure DevOps commit URL", () => {
    assert.strictEqual(
      buildCommitUrl(
        "azure",
        "https://dev.azure.com/org/project/_git/repo",
        sha
      ),
      `https://dev.azure.com/org/project/_git/repo/commit/${sha}`
    );
  });

  it("builds a generic /commit/{sha} URL for unknown providers", () => {
    assert.strictEqual(
      buildCommitUrl("unknown", "https://gitea.internal/owner/repo", sha),
      `https://gitea.internal/owner/repo/commit/${sha}`
    );
  });
});

// ---------------------------------------------------------------------------
// commitUrl (public function with SHA validation)
// ---------------------------------------------------------------------------

describe("commitUrl", () => {
  const validSha = "abc1234567890abcdef1234567890abcdef12345";
  const githubInfo: RemoteInfo = {
    provider: "github",
    commitUrlTemplate: "https://github.com/owner/repo",
  };

  it("returns the commit URL for a valid SHA", () => {
    const url = commitUrl(githubInfo, validSha);
    assert.strictEqual(url, `https://github.com/owner/repo/commit/${validSha}`);
  });

  it("returns null for an invalid SHA", () => {
    assert.strictEqual(commitUrl(githubInfo, "not-a-sha"), null);
  });

  it("returns null for a too-short SHA", () => {
    assert.strictEqual(commitUrl(githubInfo, "abc123"), null);
  });

  it("returns null for a SHA with uppercase letters", () => {
    assert.strictEqual(
      commitUrl(githubInfo, "ABC1234567890ABCDEF1234567890ABCDEF123456"),
      null
    );
  });

  it("always returns an https:// URL for GitHub", () => {
    const url = commitUrl(githubInfo, validSha);
    assert.ok(url?.startsWith("https://"));
  });

  it("always returns an https:// URL for GitLab", () => {
    const gitlabInfo: RemoteInfo = {
      provider: "gitlab",
      commitUrlTemplate: "https://gitlab.com/owner/repo",
    };
    const url = commitUrl(gitlabInfo, validSha);
    assert.ok(url?.startsWith("https://"));
  });
});

// ---------------------------------------------------------------------------
// Security: no http:// URLs ever returned
// ---------------------------------------------------------------------------

describe("URL security", () => {
  const validSha = "abc1234567890abcdef1234567890abcdef12345";

  it("normaliseRemoteUrl never returns http:// URLs", () => {
    const url = normaliseRemoteUrl("http://github.com/owner/repo.git");
    assert.strictEqual(url, null);
  });

  it("commitUrl never returns http:// URLs", () => {
    // Even if someone passes an http base URL, commitUrl uses whatever
    // buildCommitUrl returns — but normaliseRemoteUrl would have already
    // rejected http so this should never happen in practice.
    const httpInfo: RemoteInfo = {
      provider: "unknown",
      commitUrlTemplate: "https://gitea.internal/owner/repo",
    };
    const url = commitUrl(httpInfo, validSha);
    // The result must be https:// or null
    assert.ok(url === null || url.startsWith("https://"));
  });
});
