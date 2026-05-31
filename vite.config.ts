// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const viteSupabaseUrl = process.env.VITE_SUPABASE_URL;
const viteSupabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.info(
  `[build-env-audit] VITE_SUPABASE_URL=${viteSupabaseUrl ? "defined" : "missing"}; ` +
    `VITE_SUPABASE_PUBLISHABLE_KEY=${viteSupabasePublishableKey ? "defined" : "missing"}`,
);

export default defineConfig({
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        viteSupabaseUrl ?? "https://wchscoanhouhueiwjhky.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        viteSupabasePublishableKey ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjaHNjb2FuaG91aHVlaXdqaGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDI5NDMsImV4cCI6MjA5Mjg3ODk0M30.r-LHapMLl8AgSuYPVPvCeaVv0mXPbze320DXARpc3Hc",
      ),
    },
  },
});
