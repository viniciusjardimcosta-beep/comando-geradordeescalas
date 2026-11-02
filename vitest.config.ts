// Unit tests run without the application RPC transform so handlers can be mocked.
export default {
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
};