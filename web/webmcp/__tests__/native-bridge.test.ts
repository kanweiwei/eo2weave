import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWebMCPNativeBridge,
  resetWebMCPNativeBridgeForTests,
} from '../../../browser-extension/entrypoints/webmcp/native-bridge'
import type { WebMCPDiscoveredTool } from '../../../browser-extension/entrypoints/webmcp/types'

function discoveredTool(tabId: number): WebMCPDiscoveredTool {
  return {
    origin: 'https://www.xiaohongshu.com',
    name: 'like_feed',
    description: 'Like the current feed',
    inputSchema: { type: 'object' },
    hostname: 'www.xiaohongshu.com',
    fullName: 'https_www_xiaohongshu_com__like_feed',
    tabId,
    discoveredAt: 1,
    apiMode: 'documentModelContext',
  }
}

afterEach(() => {
  resetWebMCPNativeBridgeForTests()
  vi.unstubAllGlobals()
})

describe('WebMCP native bridge tab identity', () => {
  it('exposes and invokes each tab instance by an exact bridge name', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      storage: { local: { get: vi.fn(), set: vi.fn() } },
    })
    const invokeTool = vi.fn().mockResolvedValue({ ok: true, result: { tabId: 27 } })
    const bridge = getWebMCPNativeBridge({
      listTools: vi.fn().mockResolvedValue([discoveredTool(12), discoveredTool(27)]),
      invokeTool,
    })
    const postMessage = vi.fn()
    const access = bridge as unknown as {
      port: {
        postMessage: typeof postMessage
        disconnect: () => void
      }
      handleRequest: (message: Record<string, unknown>) => Promise<void>
    }
    access.port = { postMessage, disconnect: vi.fn() }

    await access.handleRequest({ reqId: 'list-1', kind: 'list' })
    const listResponse = postMessage.mock.calls[0][0]
    expect(listResponse.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'https_www_xiaohongshu_com__like_feed__tab_12',
      'https_www_xiaohongshu_com__like_feed__tab_27',
    ])

    await access.handleRequest({
      reqId: 'call-1',
      kind: 'call',
      tool: 'https_www_xiaohongshu_com__like_feed__tab_27',
      args: { feedId: 'second' },
    })

    expect(invokeTool).toHaveBeenCalledWith({
      origin: 'https://www.xiaohongshu.com',
      toolName: 'like_feed',
      tabId: 27,
      args: { feedId: 'second' },
    })
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'webmcp_bridge_response',
      reqId: 'call-1',
      ok: true,
      result: { tabId: 27 },
    })
  })
})
