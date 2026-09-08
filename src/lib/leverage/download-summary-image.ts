import { toPng } from "html-to-image";

import { APP_ICON_PATH } from "@/lib/brand";

export const LEVERAGE_SUMMARY_EXPORT_WIDTH_PX = 920;

export async function downloadPlanLeverageSummaryImage(
  node: HTMLElement,
  year: number,
): Promise<void> {
  const restore = prepareNodeForCapture(node);

  try {
    await preloadImage(APP_ICON_PATH);
    await waitForPaint();
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
    });

    const link = document.createElement("a");
    link.download = `agentic-usage-leverage-${year}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    restore();
  }
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function prepareNodeForCapture(node: HTMLElement): () => void {
  const previous = node.style.cssText;
  Object.assign(node.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-1",
    opacity: "1",
    pointerEvents: "none",
  });
  return () => {
    node.style.cssText = previous;
  };
}
