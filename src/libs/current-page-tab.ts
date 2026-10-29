import { browser } from "wxt/browser"

/**
 * The browser tab Page Assist should read page content from.
 *
 * `id` is the tab to inject into; `url` is kept alongside it so callers can
 * detect PDFs and other special pages without a second lookup.
 */
export type PageTab = {
  id: number
  url: string
}

/** Schemes that never carry the user's page: our own UI and browser internals. */
const NON_PAGE_SCHEMES = [
  "moz-extension://",
  "chrome-extension://",
  "safari-web-extension://",
  "about:",
  "view-source:"
]

/**
 * True when a tab holds a real web page the extension can act on.
 * Extension pages are excluded so the chat UI never reads itself as "the page".
 */
const isPageTab = (tab?: { id?: number; url?: string }): tab is PageTab =>
  typeof tab?.id === "number" &&
  typeof tab?.url === "string" &&
  !NON_PAGE_SCHEMES.some((scheme) => tab.url!.startsWith(scheme))

/**
 * Last page tab seen in the foreground. Background-only state: it is written by
 * the tab listeners and read back through {@link resolvePageTab}.
 */
let lastPageTab: PageTab | undefined

const remember = (tab?: { id?: number; url?: string }) => {
  if (isPageTab(tab)) {
    lastPageTab = { id: tab.id, url: tab.url }
  }
}

/**
 * Starts tracking which page the user is on. Call once from the background
 * script.
 *
 * The tracking exists because "the active tab" is not a reliable question:
 * The Android chat is an extension tab, so querying the active tab would read
 * the chat itself instead of the page the user came from. Remember that page
 * for when resolvePageTab cannot find an active page in the current window.
 */
export const initPageTabTracking = () => {
  browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs.get(tabId).then(remember).catch(() => {
      // tab closed between the event and the lookup; nothing to remember
    })
  })

  browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
    // Background tabs also emit updates; only the one in front may replace the
    // remembered page, or a finishing download would steal the chat's context.
    if (tab?.active) {
      remember(tab)
    }
  })

  browser.tabs.onRemoved.addListener((tabId) => {
    if (lastPageTab?.id === tabId) {
      lastPageTab = undefined
    }
  })

  // Seed from the tab the browser started on, so the first chat message does
  // not need the user to switch tabs first. Only fill an empty slot: a tab
  // switch may have been recorded while this query was in flight.
  browser.tabs
    .query({ active: true })
    .then((tabs) => {
      if (!lastPageTab) {
        remember(tabs.find(isPageTab))
      }
    })
    .catch(() => {})
}

/**
 * Resolves the page tab to act on, preferring what the browser reports as active
 * in the current window and falling back to the last tracked page tab.
 *
 * Must run in the background script, which owns the tab history.
 */
export const resolvePageTab = async (): Promise<PageTab | undefined> => {
  // The current-window answer is authoritative where windows exist: it keeps a
  // multi-window desktop session from reading the other window's page. Android
  // implements no windows, so this either fails or names our own chat UI, and
  // both cases fall through to the tracked tab below.
  const activeTabs = await browser.tabs
    .query({ active: true, currentWindow: true })
    .catch(() => [])
  const activePage = activeTabs?.find(isPageTab)
  if (activePage) {
    remember(activePage)
    return { id: activePage.id, url: activePage.url }
  }

  if (lastPageTab) {
    // The remembered id can go stale after a tab is closed or navigates to an
    // extension page, so re-validate before handing it to callers.
    const tab = await browser.tabs.get(lastPageTab.id).catch(() => undefined)
    if (isPageTab(tab)) {
      lastPageTab = { id: tab.id, url: tab.url }
      return lastPageTab
    }
    lastPageTab = undefined
  }

  return undefined
}

/**
 * Asks the background script which page tab to use. Returns `undefined` when no
 * page is available, so callers can degrade instead of throwing.
 *
 * Runs in extension pages such as the side panel, the popup and the web UI.
 */
export const getPageTab = async (): Promise<PageTab | undefined> => {
  try {
    const tab = await browser.runtime.sendMessage({ type: "page_tab" })
    return tab?.id ? (tab as PageTab) : undefined
  } catch {
    // Background unavailable (page loading, extension reloading): behave as if
    // the user is on no page rather than breaking the chat send path.
    return undefined
  }
}

/**
 * Resolves the tab the extension should act on, for both page-reading and
 * injection paths.
 *
 * Firefox routes this through the background script, because the chat UI may
 * itself be the most recently active tab on Android. Chromium builds keep
 * querying the active tab in the current window, where the side panel is never
 * a tab.
 */
export const getActivePageTab = async (): Promise<PageTab | undefined> => {
  if (import.meta.env.BROWSER === "firefox") {
    return getPageTab()
  }

  const tabs = await browser.tabs
    .query({ active: true, currentWindow: true })
    .catch(() => [])
  const tab = tabs?.[0]
  return tab?.id && tab.url ? { id: tab.id, url: tab.url } : undefined
}
