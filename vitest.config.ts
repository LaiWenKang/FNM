import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only, over lib/. The recommendation engine is pure functions over
// plain data — no DOM, no server, no network — which is precisely why it can be
// tested cheaply and precisely why the bugs that reached production were in the
// WIRING rather than the maths. See test/README for what that means for scope.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
