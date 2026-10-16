import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { guardedBuildCommand } from "./production-guard.mjs";

const current = "a".repeat(40);
const previous = "b".repeat(40);
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";

function build(overrides = {}) {
  // Execute the actual project command. No network, credentials, real Next
  // build, or script files from a deployment's source tree are needed.
  const doubles = `
    git(){
      [ "$*" = 'ls-remote -h https://github.com/blackshoes1/invitation-one main' ] || return 99
      printf '%s\\t%s\\n' "$MOCK_LATEST" "$MOCK_REF"
      return "$MOCK_GIT_EXIT"
    }
    timeout(){
      [ "$1" = 20 ] || return 99
      shift
      echo QUERY >&2
      "$@"
      return "$MOCK_TIMEOUT_EXIT"
    }
    npm(){
      [ "$*" = 'run build' ] || return 99
      echo BUILT
      if [ -n "$MOCK_ADVANCE_TO" ]; then MOCK_LATEST="$MOCK_ADVANCE_TO"; fi
      return "$MOCK_BUILD_EXIT"
    }
  `;
  return spawnSync(bash, ["-c", `${doubles}\n${guardedBuildCommand()}`], {
    encoding: "utf8", timeout: 10000,
    env: {
      ...process.env,
      VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: current,
      MOCK_LATEST: current, MOCK_REF: "refs/heads/main", MOCK_GIT_EXIT: "0", MOCK_TIMEOUT_EXIT: "0",
      MOCK_BUILD_EXIT: "0", MOCK_ADVANCE_TO: "", ...overrides,
    },
  });
}

test("latest main and repeat deployments of that commit pass both checks", () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = build();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "BUILT");
    assert.equal(result.stderr.trim(), "QUERY\nQUERY");
  }
});

test("an older main commit is blocked before building", () => {
  const result = build({ VERCEL_GIT_COMMIT_SHA: previous });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /BUILT/);
});

test("main advancing during build fails the second check", () => {
  const result = build({ MOCK_ADVANCE_TO: previous });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /BUILT/);
  assert.equal(result.stderr.trim(), "QUERY\nQUERY");
});

test("a branch other than main cannot deploy production", () => {
  const result = build({ VERCEL_GIT_COMMIT_REF: "feature/test" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /BUILT/);
});

test("missing, abbreviated, and invalid SHA fail closed", () => {
  for (const sha of ["", "a".repeat(7), "z".repeat(40)]) {
    const result = build({ VERCEL_GIT_COMMIT_SHA: sha });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /BUILT/);
  }
});

test("missing branch metadata fails closed", () => {
  assert.notEqual(build({ VERCEL_GIT_COMMIT_REF: "" }).status, 0);
});

test("GitHub lookup error is rejected even if it returned a matching SHA", () => {
  const result = build({ MOCK_GIT_EXIT: "128", MOCK_TIMEOUT_EXIT: "128" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /BUILT/);
});

test("lookup timeout fails closed", () => {
  const result = build({ MOCK_TIMEOUT_EXIT: "124" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /BUILT/);
});

test("missing or ambiguous remote main is rejected", () => {
  for (const overrides of [
    { MOCK_LATEST: "" }, { MOCK_REF: "refs/heads/other" },
    { MOCK_LATEST: `${current}\trefs/heads/main\n${previous}` },
  ]) {
    assert.notEqual(build(overrides).status, 0);
  }
});

test("failed Next build keeps its exit code and skips the final check", () => {
  const result = build({ MOCK_BUILD_EXIT: "42" });
  assert.equal(result.status, 42);
  assert.equal(result.stderr.trim(), "QUERY");
});

test("preview and local builds bypass GitHub lookup", () => {
  for (const env of ["preview", ""]) {
    const result = build({ VERCEL_ENV: env });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "BUILT");
    assert.equal(result.stderr, "");
  }
});

test("project command fits Vercel's 256-character limit without a source-file dependency", () => {
  assert.ok(guardedBuildCommand().length <= 256);
  assert.doesNotMatch(guardedBuildCommand(), /scripts\/|curl|wget/);
  // vercel.json overrides project settings: prevent silently bypassing the guard.
  const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.buildCommand, undefined);
});
