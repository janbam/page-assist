import { getOllamaURL, isOllamaRunning } from "../services/ollama"
import { browser } from "wxt/browser"
import { clearBadge, streamDownload, cancelDownload } from "@/utils/pull-ollama"
import { Storage } from "@plasmohq/storage"
import { getInitialConfig } from "@/services/action"
import { getCustomCopilotPrompts, getCopilotPromptsEnabledState, type CustomCopilotPrompt } from "@/services/application"
import { startMcpOAuthFlow, disconnectMcpOAuth } from "@/libs/mcp/oauth-flow"
import { McpServerDb } from "@/db/dexie/mcp"
import { initPageTabTracking, resolvePageTab } from "@/libs/current-page-tab"

export default defineBackground({
  main() {
    const storage = new Storage({
      area: "local"
    })
    let isCopilotRunning: boolean = false
    let actionIconClick: string = "webui"
    let contextMenuClick: string = "sidePanel"

    // Firefox for Android ships neither a sidebar nor context menus. Both are
    // gated on this flag once the platform is known at startup.
    let isAndroid = false

    /**
     * Brings the chat up. Desktop Firefox opens its sidebar; Android has none,
     * so the chat opens in a tab there. The fullscreen popup on Android can only
     * be opened by the user tapping the add-on entry, never from script.
     */
    const openChat = async () => {
      if (isAndroid) {
        await browser.tabs.create({
          url: browser.runtime.getURL("/sidepanel.html")
        })
        return
      }
      await browser.sidebarAction.open()
    }

    let customCopilotMenuIds: string[] = []
    const builtinCopilotMenus = [
      { id: "summarize-pa", key: "summary", title: "Summarize" },
      { id: "explain-pa", key: "explain", title: "Explain" },
      { id: "rephrase-pa", key: "rephrase", title: "Rephrase" },
      { id: "translate-pg", key: "translate", title: "Translate" },
      { id: "custom-pg", key: "custom", title: "Custom" }
    ]

    const createBuiltinCopilotMenus = async () => {
      // No menu namespace on Android; these are also reached from settings
      // refreshes, so guard here instead of only at startup.
      if (!browser.contextMenus) {
        return
      }

      const enabledState = await getCopilotPromptsEnabledState()

      for (const menu of builtinCopilotMenus) {
        // Remove existing menu
        try {
          await browser.contextMenus.remove(menu.id)
        } catch (e) {
          // Menu might not exist, ignore
        }

        // Create menu only if enabled
        if (enabledState[menu.key]) {
          browser.contextMenus.create({
            id: menu.id,
            title: menu.title,
            contexts: ["selection"]
          })
        }
      }
    }

    const createCustomCopilotMenus = async () => {
      if (!browser.contextMenus) {
        return
      }

      // Remove existing custom copilot menus
      for (const menuId of customCopilotMenuIds) {
        try {
          await browser.contextMenus.remove(menuId)
        } catch (e) {
          // Menu might not exist, ignore
        }
      }
      customCopilotMenuIds = []

      // Create new custom copilot menus
      const customPrompts = await getCustomCopilotPrompts()
      const enabledPrompts = customPrompts.filter(p => p.enabled)

      for (const prompt of enabledPrompts) {
        const menuId = `custom_copilot_${prompt.id}`
        customCopilotMenuIds.push(menuId)
        browser.contextMenus.create({
          id: menuId,
          title: prompt.title,
          contexts: ["selection"]
        })
      }
    }

    const initialize = async () => {
      try {
        // Platform first: everything UI-related below depends on it.
        const { os } = await browser.runtime.getPlatformInfo()
        isAndroid = os === "android"
        if (isAndroid) {
          // No sidebar on Android, so the add-on entry opens the chat as a
          // fullscreen popup instead of the web UI.
          browser.browserAction.setPopup({ popup: "sidepanel.html" })
        }

        storage.watch({
          actionIconClick: (value) => {
            const oldValue = value?.oldValue || "webui"
            const newValue = value?.newValue || "webui"
            if (oldValue !== newValue) {
              actionIconClick = newValue
            }
          },
          contextMenuClick: (value) => {
            if (!browser.contextMenus) {
              return
            }
            const oldValue = value?.oldValue || "sidePanel"
            const newValue = value?.newValue || "sidePanel"
            if (oldValue !== newValue) {
              contextMenuClick = newValue
              browser.contextMenus.remove(contextMenuId[oldValue])
              browser.contextMenus.create({
                id: contextMenuId[newValue],
                title: contextMenuTitle[newValue],
                contexts: ["page", "selection"]
              })
            }
          },
          customCopilotPrompts: async () => {
            // Recreate custom copilot menus when prompts change
            await createCustomCopilotMenus()
          },
          youtubeAutoSummarize: async (value) => {
            const newValue = value?.newValue || false
            const tabs = await browser.tabs.query({
              url: "*://www.youtube.com/watch*"
            })
            tabs.forEach((tab) => {
              if (tab.id) {
                browser.tabs
                  .sendMessage(tab.id, {
                    type: "youtube_summarize_setting_changed",
                    enabled: newValue
                  })
                  .catch(() => {})
              }
            })
          }
        })
        const data = await getInitialConfig()
        contextMenuClick = data.contextMenuClick
        actionIconClick = data.actionIconClick
        // All three menu registrations below are desktop-only.
        if (browser.contextMenus) {
          browser.contextMenus.create({
            id: contextMenuId[contextMenuClick],
            title: contextMenuTitle[contextMenuClick],
            contexts: ["page", "selection"]
          })

          // Create built-in copilot menus
          await createBuiltinCopilotMenus()

          // Create custom copilot menus
          await createCustomCopilotMenus()
        }
      } catch (error) {
        console.error("Error in initLogic:", error)
      }
    }

    browser.runtime.onMessage.addListener(async (message, sender) => {
      if (message.type === "page_tab") {
        // Extension pages ask here instead of querying tabs themselves: only
        // the background remembers which tab the user actually came from.
        // `null` instead of `undefined` so the reply is always sendable.
        return (await resolvePageTab()) ?? null
      } else if (message.type === "refresh_custom_copilot_menus") {
        await createCustomCopilotMenus()
        return Promise.resolve({ success: true })
      } else if (message.type === "refresh_builtin_copilot_menus") {
        await createBuiltinCopilotMenus()
        return Promise.resolve({ success: true })
      } else if (message.type === "check_youtube_summarize_enabled") {
        const enabled = await storage.get("youtubeAutoSummarize")
        return Promise.resolve({ enabled: enabled || false })
      } else if (message.type === "sidepanel") {
        await openChat()
      } else if (message.type === "pull_model") {
        const ollamaURL = await getOllamaURL()

        const isRunning = await isOllamaRunning()

        if (!isRunning) {
          setBadgeText({ text: "E" })
          setBadgeBackgroundColor({ color: "#FF0000" })
          setTitle({ title: "Ollama is not running" })
          setTimeout(() => {
            clearBadge()
          }, 5000)
          return
        }

        await streamDownload(ollamaURL, message.modelName)
      } else if (message.type === "cancel_download") {
        cancelDownload()
      } else if (message.type === "mcp_oauth_start") {
        const mcpDb = new McpServerDb()
        const server = await mcpDb.getById(message.serverId)
        if (!server) {
          return Promise.resolve({ success: false, error: "Server not found" })
        }
        const result = await startMcpOAuthFlow(server)
        return Promise.resolve(result)
      } else if (message.type === "mcp_oauth_disconnect") {
        await disconnectMcpOAuth(message.serverId)
        return Promise.resolve({ success: true })
      } else if (message.type === "youtube_summarize") {
        if (sender.tab?.id) {
          await openChat()
        }

        setTimeout(
          async () => {
            const prompt = `Summarize this YouTube video: "${message.videoTitle}".\n\nPlease provide a comprehensive summary of the video content.`

            await browser.runtime.sendMessage({
              from: "background",
              type: "yt_summarize",
              text: prompt
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      }
    })

    browser.runtime.onConnect.addListener((port) => {
      if (port.name === "pgCopilot") {
        isCopilotRunning = true
        port.onDisconnect.addListener(() => {
          isCopilotRunning = false
        })
      }
    })

    browser.browserAction.onClicked.addListener((tab) => {
      if (actionIconClick === "webui") {
        browser.tabs.create({ url: browser.runtime.getURL("/options.html") })
      } else {
        browser.sidebarAction.toggle()
      }
    })

    const contextMenuTitle = {
      webui: browser.i18n.getMessage("openOptionToChat"),
      sidePanel: browser.i18n.getMessage("openSidePanelToChat")
    }

    const contextMenuId = {
      webui: "open-web-ui-pa",
      sidePanel: "open-side-panel-pa"
    }

    browser.contextMenus?.onClicked?.addListener((info, tab) => {
      if (info.menuItemId === "open-side-panel-pa") {
        browser.sidebarAction.toggle()
      } else if (info.menuItemId === "open-web-ui-pa") {
        browser.tabs.create({
          url: browser.runtime.getURL("/options.html")
        })
      } else if (info.menuItemId === "summarize-pa") {
        if (!isCopilotRunning) {
          browser.sidebarAction.toggle()
        }
        setTimeout(
          async () => {
            await browser.runtime.sendMessage({
              from: "background",
              type: "summary",
              text: info.selectionText
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      } else if (info.menuItemId === "rephrase-pa") {
        if (!isCopilotRunning) {
          browser.sidebarAction.toggle()
        }
        setTimeout(
          async () => {
            await browser.runtime.sendMessage({
              type: "rephrase",
              from: "background",
              text: info.selectionText
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      } else if (info.menuItemId === "translate-pg") {
        if (!isCopilotRunning) {
          browser.sidebarAction.toggle()
        }
        setTimeout(
          async () => {
            await browser.runtime.sendMessage({
              type: "translate",
              from: "background",
              text: info.selectionText
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      } else if (info.menuItemId === "explain-pa") {
        if (!isCopilotRunning) {
          browser.sidebarAction.toggle()
        }
        setTimeout(
          async () => {
            await browser.runtime.sendMessage({
              type: "explain",
              from: "background",
              text: info.selectionText
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      } else if (info.menuItemId === "custom-pg") {
        if (!isCopilotRunning) {
          browser.sidebarAction.toggle()
        }
        setTimeout(
          async () => {
            await browser.runtime.sendMessage({
              type: "custom",
              from: "background",
              text: info.selectionText
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      } else if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("custom_copilot_")) {
        // Handle custom copilot prompts
        if (!isCopilotRunning) {
          browser.sidebarAction.toggle()
        }
        setTimeout(
          async () => {
            await browser.runtime.sendMessage({
              type: info.menuItemId,
              from: "background",
              text: info.selectionText
            })
          },
          isCopilotRunning ? 0 : 5000
        )
      }
    })

    // `commands` does not exist on Android either.
    browser.commands?.onCommand?.addListener((command) => {
      switch (command) {
        case "execute_side_panel":
          browser.sidebarAction.toggle()
          break
        default:
          break
      }
    })

    initPageTabTracking()
    initialize()
  },
  persistent: true
})
