import assert from "node:assert/strict";
import test from "node:test";

import { resolvePortfolioRoot } from "../src/lib/local-projects.ts";

test("resolves Johny local portfolio root from the current macOS home", () => {
  assert.equal(resolvePortfolioRoot({ home: "/Users/horsedriver" }), "/Users/horsedriver/0_DEV");
});

test("explicit root and environment override auto-detected home", () => {
  assert.equal(resolvePortfolioRoot({ root: "/tmp/explicit", envRoot: "/tmp/env", home: "/Users/horsedriver" }), "/tmp/explicit");
  assert.equal(resolvePortfolioRoot({ envRoot: "/tmp/env", home: "/Users/horsedriver" }), "/tmp/env");
});
