// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useListNav } from "./useListNav";

const ids = ["a", "b", "c", "d"];

describe("useListNav", () => {
  it("starts empty; ↓ enters at the top, ↑ from nothing enters at the bottom", () => {
    const { result } = renderHook(() => useListNav(ids));
    expect(result.current.cursor).toBeNull();
    act(() => result.current.move(1));
    expect(result.current.cursor).toBe("a");
    expect([...result.current.selected]).toEqual(["a"]);
    act(() => result.current.clear());
    act(() => result.current.move(-1));
    expect(result.current.cursor).toBe("d");
  });

  it("moves and clamps at the edges; atFirst / atLast reflect position", () => {
    const { result } = renderHook(() => useListNav(ids));
    act(() => result.current.focus("c"));
    act(() => result.current.move(1));
    act(() => result.current.move(1));
    expect(result.current.cursor).toBe("d");
    expect(result.current.atLast).toBe(true);
    act(() => result.current.move(-1));
    act(() => result.current.move(-1));
    act(() => result.current.move(-1));
    act(() => result.current.move(-1));
    expect(result.current.cursor).toBe("a");
    expect(result.current.atFirst).toBe(true);
  });

  it("shift-extends a range from the anchor; plain move collapses it", () => {
    const { result } = renderHook(() => useListNav(ids));
    act(() => result.current.focus("b"));
    act(() => result.current.move(1, true));
    act(() => result.current.move(1, true));
    expect([...result.current.selected].sort()).toEqual(["b", "c", "d"]);
    expect(result.current.targets.length).toBe(3);
    act(() => result.current.move(-1));
    expect([...result.current.selected]).toEqual(["c"]);
  });

  it("toggle adds/removes; selectAll selects everything; clear resets", () => {
    const { result } = renderHook(() => useListNav(ids));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("c"));
    expect([...result.current.selected].sort()).toEqual(["a", "c"]);
    act(() => result.current.toggle("a"));
    expect([...result.current.selected]).toEqual(["c"]);
    act(() => result.current.selectAll());
    expect(result.current.selected.size).toBe(4);
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.cursor).toBeNull();
  });

  it("drops the cursor and selected ids that disappear from the list", () => {
    const { result, rerender } = renderHook(({ list }) => useListNav(list), { initialProps: { list: ids } });
    act(() => result.current.focus("b"));
    act(() => result.current.move(1, true)); // b, c
    rerender({ list: ["a", "b", "d"] });
    expect([...result.current.selected]).toEqual(["b"]);
    rerender({ list: ["a", "d"] });
    expect(result.current.cursor).toBeNull();
    expect(result.current.targets).toEqual([]);
  });
});
