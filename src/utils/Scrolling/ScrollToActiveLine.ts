import Defaults from "../../components/Global/Defaults.ts";
import Global from "../../components/Global/Global.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import { IsCompactMode } from "../../components/Utils/CompactMode.ts";
import { IsPIP } from "../../components/Utils/PopupLyrics.ts";
import {
  type LyricsLine,
  LyricsObject,
  type LyricsSyllable,
  type LyricsType,
} from "../Lyrics/lyrics.ts";
import { ScrollIntoCenterViewCSS } from "../ScrollIntoView/Center.ts";
import { ScrollIntoTopViewCSS } from "../ScrollIntoView/Top.ts";

// Define intersection types that include _LineIndex
type LyricsLineWithIndex = LyricsLine & { _LineIndex: number };
type LyricsSyllableWithIndex = LyricsSyllable & { _LineIndex: number };
type EnhancedLyricsItem = LyricsLineWithIndex | LyricsSyllableWithIndex;

// Define proper types for variables
let lastLineIndex: number = -1; // Track by index instead of element reference
let isUserScrolling = false;
let lastUserScrollTime = 0;
let lastPosition: number = 0;
const USER_SCROLL_COOLDOWN = 750; // 0.75 second cooldown
// const POSITION_THRESHOLD = 500; // 500ms threshold for start/end detection

// Force scroll queue mechanism
let forceScrollQueued = false;
let smoothForceScrollQueued = false;

// RAF-based scroll deferral
let pendingScrollRAF: number | null = null;

// --- NEW: Module variables for cleanup ---
let currentSimpleBarInstance: any | null = null;
let wheelHandler: (() => void) | null = null;
let touchMoveHandler: (() => void) | null = null;
// --- END NEW ---

const wasDrasticPositionChange = (lastPosition: number, newPosition: number) => {
  const positionChange = Math.abs(newPosition - lastPosition);
  return positionChange > 1000;
};

// Add focus event listener to reset state when window is focused
window.addEventListener("focus", ResetLastLine);
// Add resize event listener to reset state when window is resized
window.addEventListener("resize", ResetLastLine);

// Create ResizeObserver to monitor LyricsContent container dimensions
const lyricsContentObserver = new ResizeObserver(() => {
  ResetLastLine();
});

// Function to setup the observer
function setupLyricsContentObserver() {
  const lyricsContent = PageContainer?.querySelector(".LyricsContainer .LyricsContent");
  if (lyricsContent) {
    // Ensure we don't observe multiple times if called again
    lyricsContentObserver.disconnect();
    lyricsContentObserver.observe(lyricsContent);
  }
}

function handleUserScroll(ScrollSimplebar: any | null) {
  // Allow null
  if (!ScrollSimplebar) return; // Add null check
  if (!isUserScrolling) {
    isUserScrolling = true;
    // Add HideLineBlur class when user starts scrolling
    const lyricsContent = PageContainer?.querySelector(
      ".LyricsContainer .LyricsContent"
    );
    if (lyricsContent) {
      lyricsContent.classList.add("HideLineBlur");
    } else {
      // --- NEW: Add warning if element not found ---
      console.warn(
        "SpicyLyrics: Could not find .LyricsContent in handleUserScroll to add HideLineBlur."
      );
      // --- END NEW ---
    }
  }
  lastUserScrollTime = performance.now();
}

// Initialization function for scroll events and observers
export function InitializeScrollEvents(ScrollSimplebar: any) {
  if (!Defaults.LyricsContainerExists) return;
  // --- NEW: Store instance and define handlers ---
  currentSimpleBarInstance = ScrollSimplebar;
  wheelHandler = () => handleUserScroll(currentSimpleBarInstance);
  touchMoveHandler = () => handleUserScroll(currentSimpleBarInstance);
  // --- END NEW ---

  // Setup the observer
  setupLyricsContentObserver();

  // Add scroll event listener
  const scrollElement = ScrollSimplebar?.getScrollElement();
  if (scrollElement && wheelHandler && touchMoveHandler) {
    // Check handlers exist
    // Remove potential old listeners first (optional, but safer if called multiple times)
    scrollElement.removeEventListener("wheel", wheelHandler);
    scrollElement.removeEventListener("touchmove", touchMoveHandler);
    // Add new listeners
    scrollElement.addEventListener("wheel", wheelHandler);
    scrollElement.addEventListener("touchmove", touchMoveHandler);
  }
}

const GetScrollLine = (Lines: LyricsLine[] | LyricsSyllable[], ProcessedPosition: number) => {
  if (Defaults.CurrentLyricsType === "Static" || Defaults.CurrentLyricsType === "None" || !Lines)
    return;
  
  // Optimized: Find active lines without creating intermediate arrays
  let firstActiveIdx = -1;
  let lastActiveIdx = -1;
  let activeCount = 0;
  
  for (let i = 0; i < Lines.length; i++) {
    const line = Lines[i];
    if (
      typeof line.StartTime === "number" &&
      typeof line.EndTime === "number" &&
      line.StartTime <= ProcessedPosition &&
      line.EndTime >= ProcessedPosition
    ) {
      if (firstActiveIdx === -1) firstActiveIdx = i;
      lastActiveIdx = i;
      activeCount++;
    }
  }
  
  // No active lines
  if (activeCount === 0) return null;
  
  // One active line or contiguous lines - return the first
  if (activeCount === 1 || lastActiveIdx - firstActiveIdx <= 1) {
    const line = Lines[firstActiveIdx];
    return { ...line, _LineIndex: firstActiveIdx } as EnhancedLyricsItem;
  }
  
  // Gap bigger than 1 - return the last
  const line = Lines[lastActiveIdx];
  return { ...line, _LineIndex: lastActiveIdx } as EnhancedLyricsItem;
};

const ScrollTo = (
  container: HTMLElement,
  element: HTMLElement,
  instantScroll: boolean = false,
  type: "Center" | "Top" = "Center"
) => {
  // Cancel any pending scroll RAF to avoid conflicts
  if (pendingScrollRAF !== null) {
    cancelAnimationFrame(pendingScrollRAF);
    pendingScrollRAF = null;
  }
  
  // Defer scroll write to next frame to batch with other DOM updates
  pendingScrollRAF = requestAnimationFrame(() => {
    pendingScrollRAF = null;
    if (type === "Center") {
      ScrollIntoCenterViewCSS(container, element, -30, instantScroll);
    } else if (type === "Top") {
      ScrollIntoTopViewCSS(container, element, (IsPIP ? 50 : 85), instantScroll);
    }
  });
};

let scrolledToLastLine = false;
let scrolledToFirstLine = false;

const GetScrollType = (): "Center" | "Top" => {
  return IsCompactMode() ? "Top" : "Center";
};

const policyEventPreset = "policy:";

let allowForceScrolling = true;
let waitingForHeight = true;

export const SetForceScrollingPolicy = (value: boolean) => {
  allowForceScrolling = value; // true = allow force scrolling, false = disallow force scrolling
  Global.Event.evoke(`${policyEventPreset}force-scrolling`, value);
};
export const GetForceScrollingPolicy = () => {
  return allowForceScrolling;
};

export const SetWaitingForHeight = (value: boolean) => {
  waitingForHeight = value;
  Global.Event.evoke(`${policyEventPreset}waiting-for-height`, value);
};
export const IsWaitingForHeight = () => {
  return waitingForHeight;
};

export function ScrollToActiveLine(ScrollSimplebar: any) {
  if (waitingForHeight) return;
  if (Defaults.CurrentLyricsType === "Static" || Defaults.CurrentLyricsType === "None") return;
  if (!Defaults.LyricsContainerExists) return;

  const currentType = Defaults.CurrentLyricsType as LyricsType;
  const Lines = LyricsObject.Types[currentType]?.Lines as LyricsLine[] | LyricsSyllable[];
  if (!Lines) return;

  // Check if a force scroll was queued
  const isForceScrollQueued = forceScrollQueued;
  const isSmoothForceScrollQueued = smoothForceScrollQueued;

  //if (Spicetify.Platform.History.location.pathname === "/SpicyLyrics") {
  const Position = SpotifyPlayer.GetPosition();
  const PositionOffset = 0;
  const ProcessedPosition = Position + PositionOffset;
  const currentLine = GetScrollLine(Lines, ProcessedPosition) as EnhancedLyricsItem | null;
  const currentLineIndex = currentLine?._LineIndex ?? -1;

  // Optimized: Use simple loop counters instead of filter/every to avoid array allocations
  let notSungCount = 0;
  let activeCount = 0;
  let sungCount = 0;
  const lineCount = Lines.length;
  
  for (let i = 0; i < lineCount; i++) {
    const status = (Lines[i] as any).Status;
    if (status === "NotSung") notSungCount++;
    else if (status === "Active") activeCount++;
    else if (status === "Sung") sungCount++;
  }
  
  const allLinesNotSung = notSungCount === lineCount;
  const oneActiveNoSung = activeCount === 1 && sungCount === 0;
  const allLinesSung = sungCount === lineCount;
  const shouldForceScroll = isForceScrollQueued || lastLineIndex === -1;

  if (
    shouldForceScroll ||
    (!SpotifyPlayer.IsPlaying && lastPosition !== Position) ||
    (lastPosition !== 0 && wasDrasticPositionChange(lastPosition ?? 0, Position))
  ) {
    if (!allowForceScrolling) return;
    const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
    if (!container) return;
    isUserScrolling = false;
    const scrollToLine = allLinesSung
      ? Lines[Lines.length - 1]?.HTMLElement
      : currentLine?.HTMLElement;
    if (!scrollToLine) return;
    lastLineIndex = allLinesSung ? Lines.length - 1 : currentLineIndex;
    ScrollTo(
      container,
      scrollToLine,
      shouldForceScroll || (lastPosition !== 0 && wasDrasticPositionChange(lastPosition ?? 0, Position)),
      GetScrollType()
    );
    if (forceScrollQueued) {
      forceScrollQueued = false; // Reset the queue after using it
    }
    lastPosition = Position;
    return;
  }

  lastPosition = Position;

  if (isSmoothForceScrollQueued) {
    if (!allowForceScrolling) return;
    const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
    if (!container) return;
    isUserScrolling = false;
    const scrollToLine = allLinesSung
      ? Lines[Lines.length - 1]?.HTMLElement
      : currentLine?.HTMLElement;
    if (!scrollToLine) return;
    lastLineIndex = allLinesSung ? Lines.length - 1 : currentLineIndex;
    ScrollTo(container, scrollToLine, false, GetScrollType());
    if (smoothForceScrollQueued) {
      smoothForceScrollQueued = false; // Reset the queue after using it
    }
    return;
  }

  if (!Lines) return;

  // --- NEW: Check conditions to scroll to top ---

  if (allLinesNotSung || oneActiveNoSung) {
    if (scrolledToFirstLine) return;
    QueueSmoothForceScroll();
    scrolledToFirstLine = true;
  }
  // --- END NEW ---

  // Check if all lines are sung

  if (allLinesSung) {
    if (scrolledToLastLine) return;
    QueueSmoothForceScroll();
    scrolledToLastLine = true;
  }

  // Early exit: if line index hasn't changed, no need to scroll
  if (currentLineIndex === lastLineIndex) {
    return;
  }

  Continue(currentLine, currentLineIndex);

  function Continue(currentLine: EnhancedLyricsItem | null, lineIndex: number) {
    if (currentLine) {
      const LineElem = currentLine?.HTMLElement as HTMLElement;
      if (!LineElem) return;
      const container = ScrollSimplebar?.getScrollElement() as HTMLElement;
      if (!container) return;

      const timeSinceLastScroll = performance.now() - lastUserScrollTime;

      // Only auto-scroll if user hasn't scrolled recently (cooldown passed)
      // We no longer check viewport visibility - if line changed and cooldown passed, we scroll
      if (timeSinceLastScroll > USER_SCROLL_COOLDOWN) {
        isUserScrolling = false;
        // Remove HideLineBlur class when resuming auto-scroll
        const lyricsContent = PageContainer?.querySelector(
          ".LyricsContainer .LyricsContent"
        );
        if (lyricsContent) {
          lyricsContent.classList.remove("HideLineBlur");
        }
        
        // Update last line index and scroll
        lastLineIndex = lineIndex;
        const Scroll = () => {
          ScrollTo(container, LineElem, false, GetScrollType());
          scrolledToLastLine = false;
          scrolledToFirstLine = false;
        };
        if (
          Lines[currentLine._LineIndex - 1] &&
          Lines[currentLine._LineIndex - 1].DotLine === true
        ) {
          setTimeout(Scroll, 240);
        } else {
          Scroll();
        }
      }
    }
  }
  //}
}

// Function to queue a force scroll for the next frame
export function QueueForceScroll() {
  forceScrollQueued = true;
}

export function QueueSmoothForceScroll() {
  smoothForceScrollQueued = true;
}

export function ResetLastLine() {
  lastLineIndex = -1;
  isUserScrolling = false;
  lastUserScrollTime = 0;
  lastPosition = 0;
  forceScrollQueued = false;
  smoothForceScrollQueued = false;
  scrolledToLastLine = false;
  scrolledToFirstLine = false;
  // Cancel any pending scroll RAF
  if (pendingScrollRAF !== null) {
    cancelAnimationFrame(pendingScrollRAF);
    pendingScrollRAF = null;
  }
  // Also disconnect observer on reset if needed, though setup handles disconnect now
  // lyricsContentObserver.disconnect();
}

// --- NEW: Cleanup Function ---
export function CleanupScrollEvents() {
  // Cancel any pending scroll RAF
  if (pendingScrollRAF !== null) {
    cancelAnimationFrame(pendingScrollRAF);
    pendingScrollRAF = null;
  }

  // Remove scroll listeners
  const scrollElement = currentSimpleBarInstance?.getScrollElement();
  if (scrollElement) {
    if (wheelHandler) {
      scrollElement.removeEventListener("wheel", wheelHandler);
    }
    if (touchMoveHandler) {
      scrollElement.removeEventListener("touchmove", touchMoveHandler);
    }
  }

  // Disconnect observer
  lyricsContentObserver?.disconnect();

  // Remove window listeners
  window.removeEventListener("focus", ResetLastLine);
  window.removeEventListener("resize", ResetLastLine);

  // Reset module variables
  currentSimpleBarInstance = null;
  wheelHandler = null;
  touchMoveHandler = null;
  forceScrollQueued = false; // Reset force scroll queue
  smoothForceScrollQueued = false;
  scrolledToLastLine = false;
  scrolledToFirstLine = false;
  //console.log("SpicyLyrics scroll events cleaned up."); // Optional log
}
// --- END NEW ---
