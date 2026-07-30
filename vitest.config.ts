import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only, over lib/. The recommendation engine is pure functions over
// plain data — no DOM, no server, no network — which is precisely why it can be
// tested cheaply and precisely why the bugs that reached production were in the
// WIRING rather than the maths. See test/README for what that means for scope.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      // Data tables and generated art, not logic: covering them measures
      // nothing and would hide the modules that actually need attention.
      exclude: ["lib/data/**", "lib/togoLines.ts"],
      reporter: ["text-summary", "text"],
      /* A FLOOR, NOT A TARGET. Set just under the numbers the suite actually
         reaches, so the build fails when a change ADDS untested code rather
         than when someone writes one test fewer than yesterday. Coverage is
         not the goal — these exist so the seven modules that once sat at zero
         percent, all of them in the request path, cannot drift back. */
      thresholds: { statements: 95, branches: 88, functions: 97, lines: 95 },
    },
  },
});
