import { getActivePageTab } from "@/libs/current-page-tab"

/**
 * Captures the visible area of the current browser window as a PNG data URL.
 *
 * Chromium captures directly; Firefox first asks the background for the page
 * tab, so a session with no page open fails with a clear error instead of
 * silently capturing the chat UI. The capture itself stays window-level: it
 * returns whatever is visible, which is why callers only request it while a page
 * is in front.
 */
const captureVisibleTab = async (): Promise<string> => {
  if (
    import.meta.env.BROWSER === "chrome" ||
    import.meta.env.BROWSER === "edge"
  ) {
    return new Promise<string>((resolve) => {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        resolve(dataUrl)
      })
    })
  }

  const tab = await getActivePageTab()
  if (!tab) {
    throw new Error("No page is open to capture")
  }

  return (await Promise.race([
    browser.tabs.captureVisibleTab(null, { format: "png" }),
    new Promise((_, timeout) =>
      setTimeout(
        () => timeout(new Error("Screenshot capture timed out")),
        10000
      )
    )
  ])) as string
}

export const getScreenshotFromCurrentTab = async () => {
  try {
    const screenshotDataUrl = await captureVisibleTab()
    return {
      success: true,
      screenshot: screenshotDataUrl,
      error: null
    }
  } catch (error) {
    return {
      success: false,
      screenshot: null,
      error:
        error instanceof Error ? error.message : "Failed to capture screenshot"
    }
  }
}
