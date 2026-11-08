"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const moreClassName = "inline h-auto rounded-none border-0 p-0 align-baseline text-sm font-semibold leading-[inherit] text-teal-700 hover:text-teal-900";

export function MenuItemDescription({ text, itemName }: { text: string; itemName: string }) {
  const description = text.trim().replace(/\s+/g, " ");
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const measureTextRef = useRef<HTMLSpanElement>(null);
  const measureSuffixRef = useRef<HTMLSpanElement>(null);
  const [measurement, setMeasurement] = useState<{ source: string; excerpt: string | null } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const excerpt = measurement?.source === description ? measurement.excerpt : undefined;

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    const measureText = measureTextRef.current;
    const suffix = measureSuffixRef.current;

    if (!container || !measure || !measureText || !suffix) return;
    let active = true;

    function updateExcerpt() {
      if (!active || !container || !measure || !measureText || !suffix || container.clientWidth === 0) return;
      const style = getComputedStyle(measure);
      const maxLines = Number.parseInt(style.getPropertyValue("--description-lines"), 10);
      const maxHeight = Number.parseFloat(style.lineHeight) * maxLines + 1;
      measureText.textContent = description;
      suffix.hidden = true;

      if (measure.getBoundingClientRect().height <= maxHeight) {
        setMeasurement({ source: description, excerpt: null });
        return;
      }

      // Reserve space for the inline ellipsis and control within the line budget.
      suffix.hidden = false;
      const characters = Array.from(description);
      let low = 0;
      let high = characters.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        measureText.textContent = characters.slice(0, middle).join("").trimEnd();
        if (measure.getBoundingClientRect().height <= maxHeight) low = middle;
        else high = middle - 1;
      }

      let nextExcerpt = characters.slice(0, low).join("").trimEnd();
      const wordBoundary = nextExcerpt.lastIndexOf(" ");
      if (wordBoundary > nextExcerpt.length * 0.7) nextExcerpt = nextExcerpt.slice(0, wordBoundary);
      setMeasurement({ source: description, excerpt: nextExcerpt });
    }

    updateExcerpt();
    const observer = new ResizeObserver(updateExcerpt);
    observer.observe(container);
    void document.fonts.ready.then(updateExcerpt);
    return () => { active = false; observer.disconnect(); };
  }, [description]);

  const canExpand = typeof excerpt === "string";

  return (
    <div ref={containerRef} className="relative mt-2 min-w-0 text-sm leading-6 text-stone-500 [overflow-wrap:anywhere] [--description-lines:2] sm:[--description-lines:1]">
      <p data-slot="menu-item-description" className={excerpt === undefined && !expanded ? "line-clamp-2 sm:line-clamp-1" : undefined}>
        <span data-slot="menu-item-description-text">{expanded || !canExpand ? description : excerpt}</span>
        {canExpand ? (
          <span data-slot="menu-item-description-toggle" className="whitespace-nowrap">
            {expanded ? " " : "… "}
            <Button
              type="button"
              variant="link"
              className={moreClassName}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Less" : "More"} about ${itemName}`}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Less" : "More"}
            </Button>
          </span>
        ) : null}
      </p>
      <p ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0">
        <span ref={measureTextRef} />
        <span ref={measureSuffixRef} className="whitespace-nowrap">… <span className="font-semibold">More</span></span>
      </p>
    </div>
  );
}
