// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
afterEach(() => cleanup());
describe("x", () => {
  it("a", () => { render(<button data-testid="b" />); expect(screen.getByTestId("b")).toBeDefined(); });
  it("b", () => { render(<button data-testid="b" />); expect(document.querySelectorAll('[data-testid=b]').length).toBe(1); });
});
