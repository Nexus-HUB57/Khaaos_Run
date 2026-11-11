import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../client/src/hooks/use-auth.ts", import.meta.url), "utf8");

test("logout do cliente submete POST same-origin, não navega por GET", () => {
  assert.match(source, /form\.method\s*=\s*["']POST["']/);
  assert.match(source, /form\.action\s*=\s*["']\/api\/logout["']/);
  assert.match(source, /form\.submit\(\)/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*["']\/api\/logout/);
});
