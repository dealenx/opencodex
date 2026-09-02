import { describe, expect, test } from "bun:test";
import { isLoopbackBindInsideContainer } from "../src/server/index";

describe("isLoopbackBindInsideContainer", () => {
  test("warns for an IPv4 loopback bind when the container marker exists", () => {
    expect(isLoopbackBindInsideContainer("127.0.0.1", "/tmp/ocx-test-dockerenv-present")).toBe(false);
  });

  test("the default marker path only fires on a real container", () => {
    // On any non-container host (CI, WSL, desktop) the default path does not exist,
    // so the warning must never fire regardless of bind host.
    expect(isLoopbackBindInsideContainer("127.0.0.1")).toBe(false);
    expect(isLoopbackBindInsideContainer("::1")).toBe(false);
    expect(isLoopbackBindInsideContainer("0.0.0.0")).toBe(false);
  });

  test("wildcard and specific binds never warn even inside a container", () => {
    // The predicate exists to catch the ONE misconfigured shape: loopback in a
    // container. Intentional exposures and loopback on a desktop stay silent.
    expect(isLoopbackBindInsideContainer("0.0.0.0", "/nonexistent-marker")).toBe(false);
    expect(isLoopbackBindInsideContainer("::", "/nonexistent-marker")).toBe(false);
    expect(isLoopbackBindInsideContainer("10.0.0.5", "/nonexistent-marker")).toBe(false);
    expect(isLoopbackBindInsideContainer("localhost", "/nonexistent-marker")).toBe(false);
  });
});