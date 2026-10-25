import { getActivePageTab } from "@/libs/current-page-tab"

const captureVisibleTab = () => {
  const result = new Promise<string>((resolve, reject) => {
    if (import.meta.env.BROWSER === "chrome" || import.meta.env.BROWSER === "edge") {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs[0]
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
          resolve(dataUrl)
        })
      })
    } else {
      // Only capture when the background knows a page tab: with the chat in
      // front (Android popup, or a chat tab) a window capture could return our
      // own UI instead of the page.
      getActivePageTab().then(async (tab) => {
        if (!tab) {
          reject(new Error("No page is open to capture"))
          return
        }

        try {
          const dataUrl = (await Promise.race([
            browser.tabs.captureVisibleTab(null, { format: "png" }),
            new Promise((_, timeout) =>
              setTimeout(
                () => timeout(new Error("Screenshot capture timed out")),
                10000
              )
            )
          ])) as string
          resolve(dataUrl)
        } catch (error) {
          reject(error)
        }
      })
    }
  })
  return result
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
