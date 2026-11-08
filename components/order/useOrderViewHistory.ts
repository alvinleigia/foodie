"use client";

import { useEffect, useRef } from "react";

type OrderView = "menu" | "cart" | "review" | "customize" | "quantity";
type Frame<T> = { view: OrderView; snapshot: T; scrollY: number };

export function useOrderViewHistory<T>({
  view,
  snapshot,
  restore,
  canRestore,
}: {
  view: OrderView;
  snapshot: T;
  restore: (snapshot: T) => void;
  canRestore: (snapshot: T) => boolean;
}) {
  const latest = useRef({ view, snapshot, restore, canRestore });
  const frames = useRef(new Map<number, Frame<T>>());
  const owner = useRef("");
  const index = useRef(0);
  const pendingTraversal = useRef<number | null>(null);
  const restoringView = useRef<OrderView | null>(null);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    latest.current = { view, snapshot, restore, canRestore };
  });

  useEffect(() => {
    const route = `${window.location.pathname}${window.location.search}`;
    const initial = latest.current;
    owner.current = crypto.randomUUID();
    index.current = 0;
    frames.current.clear();
    frames.current.set(0, { view: initial.view, snapshot: initial.snapshot, scrollY: window.scrollY });
    window.history.replaceState({
      ...window.history.state,
      foodieOrderView: { owner: owner.current, index: 0 },
    }, "");

    function onPopState(event: PopStateEvent) {
      if (`${window.location.pathname}${window.location.search}` !== route) return;

      const previous = frames.current.get(index.current);
      if (previous && previous.view === latest.current.view) previous.scrollY = window.scrollY;
      const entry = event.state?.foodieOrderView;
      let targetIndex = entry?.owner === owner.current ? entry.index : 0;
      let target = entry?.owner === owner.current ? frames.current.get(targetIndex) : undefined;

      // A reload or completed order must not reopen an empty/stale checkout.
      if (!target || !latest.current.canRestore(target.snapshot)) {
        targetIndex = 0;
        target = { view: initial.view, snapshot: initial.snapshot, scrollY: 0 };
        frames.current.clear();
        frames.current.set(0, target);
        window.history.replaceState({
          ...window.history.state,
          foodieOrderView: { owner: owner.current, index: 0 },
        }, "");
      }

      index.current = targetIndex;
      pendingTraversal.current = null;
      restoringView.current = target.view === latest.current.view ? null : target.view;
      latest.current.restore(target.snapshot);
      const scrollY = target.view === "review" ? 0 : target.scrollY;
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = requestAnimationFrame(() => {
        animationFrame.current = requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
        });
      });
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  useEffect(() => {
    const previous = frames.current.get(index.current);
    if (!previous || pendingTraversal.current !== null) return;
    if (restoringView.current !== null) {
      if (restoringView.current !== view) return;
      restoringView.current = null;
      previous.snapshot = snapshot;
      return;
    }
    if (previous.view === view) {
      previous.snapshot = snapshot;
      return;
    }

    if (view !== "review") previous.scrollY = window.scrollY;
    const ancestor = [...frames.current.entries()]
      .filter(([entryIndex, frame]) => entryIndex < index.current && frame.view === view)
      .at(-1);
    if (ancestor) {
      pendingTraversal.current = ancestor[0];
      window.history.go(ancestor[0] - index.current);
      return;
    }

    const replace = previous.view === "quantity" && view === "customize";
    const nextIndex = replace ? index.current : index.current + 1;
    for (const entryIndex of frames.current.keys()) {
      if (entryIndex > index.current) frames.current.delete(entryIndex);
    }
    frames.current.set(nextIndex, {
      view,
      snapshot,
      scrollY: view === "review" ? 0 : window.scrollY,
    });
    index.current = nextIndex;
    const state = {
      ...window.history.state,
      foodieOrderView: { owner: owner.current, index: nextIndex },
    };
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
  }, [view, snapshot]);
}
