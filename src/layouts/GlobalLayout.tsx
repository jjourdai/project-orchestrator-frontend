import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { MessageCircle, Network, Settings, ArrowLeft } from 'lucide-react'
import { chatPanelModeAtom, chatPanelWidthAtom, eventBusStatusAtom, workspacesAtom, activeWorkspaceAtom, workspaceRefreshAtom } from '@/atoms'
import { ToastContainer, Branding } from '@/components/ui'
import { ChatPanel } from '@/components/chat'
import { FederationPanel } from '@/components/mcpFederation/FederationPanel'
import { useCrudEventRefresh, useMediaQuery, useDragRegion, useWindowFullscreen } from '@/hooks'
import { isTauri } from '@/services/env'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'

// ============================================================================
// BREADCRUMB — simple label mapping for global routes
// ============================================================================

const ROUTE_LABELS: Record<string, string> = {
  admin: 'Administration',
  'mcp-federation': 'MCP Federation',
  'neural-routing': 'Neural Routing',
}

function GlobalBreadcrumb() {
  const { pathname } = useLocation()
  const segment = pathname.split('/').filter(Boolean)[0] || ''
  const label = ROUTE_LABELS[segment] || segment

  return (
    <nav className="flex items-center gap-2 text-sm min-w-0">
      <span className="text-gray-200 font-medium truncate">{label}</span>
    </nav>
  )
}

// ============================================================================
// LAYOUT
// ============================================================================

export function GlobalLayout() {
  const location = useLocation()
  const [chatMode, setChatMode] = useAtom(chatPanelModeAtom)
  const [chatWidth] = useAtom(chatPanelWidthAtom)
  const [federationPanelOpen, setFederationPanelOpen] = useState(false)
  const isSmUp = useMediaQuery('(min-width: 640px)')
  const chatOpen = chatMode === 'open'
  const chatFullscreen = chatMode === 'fullscreen'
  const wsStatus = useAtomValue(eventBusStatusAtom)
  const setWorkspaces = useSetAtom(workspacesAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const wsRefresh = useAtomValue(workspaceRefreshAtom)
  const isWindowFullscreen = useWindowFullscreen()
  const trafficLightPad = isTauri && !isWindowFullscreen
  const onDragMouseDown = useDragRegion()

  // Load workspaces list (for back-to-workspace link)
  useEffect(() => {
    workspacesApi
      .list({ limit: 100, sort_by: 'name', sort_order: 'asc' })
      .then((data) => setWorkspaces(data.items || []))
      .catch(() => {})
  }, [setWorkspaces, wsRefresh])

  // WebSocket CRUD event bus
  useCrudEventRefresh()

  const isAdminActive = location.pathname.startsWith('/admin')
  const isFederationActive = location.pathname.startsWith('/mcp-federation')

  return (
    <div className="flex min-h-0 flex-1 bg-surface-base">
      {/* Main content — full width, no sidebar */}
      <main
        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-300"
        style={{ marginRight: chatOpen && !chatFullscreen && isSmUp ? chatWidth : 0 }}
      >
        {/* Header */}
        <header
          className={`h-16 flex items-center px-4 md:px-6 border-b border-border-subtle bg-surface-raised/80 backdrop-blur-sm ${trafficLightPad ? 'pt-6' : ''}`}
          onMouseDown={onDragMouseDown}
        >
          {/* Back to workspace */}
          {activeWorkspace && (
            <NavLink
              to={workspacePath(activeWorkspace.slug, '/projects')}
              className="mr-3 p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
              title={`Back to ${activeWorkspace.name}`}
            >
              <ArrowLeft className="w-5 h-5" />
            </NavLink>
          )}

          {/* WS status dot */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 mr-2.5 transition-colors ${
              wsStatus === 'connected'
                ? 'bg-emerald-400'
                : wsStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-gray-600'
            }`}
            title={`WebSocket: ${wsStatus}`}
          />

          <GlobalBreadcrumb />

          {/* Header right icons */}
          <div className="ml-auto flex items-center gap-1">
            {/* Federation panel toggle */}
            <button
              onClick={() => setFederationPanelOpen(!federationPanelOpen)}
              className={`p-2 rounded-lg transition-colors ${federationPanelOpen || isFederationActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'}`}
              title="MCP Federation"
            >
              <Network className="w-5 h-5" />
            </button>

            {/* Admin link */}
            <NavLink
              to="/admin"
              className={`p-2 rounded-lg transition-colors ${isAdminActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'}`}
              title="Administration"
            >
              <Settings className="w-5 h-5" />
            </NavLink>

            {/* Chat toggle */}
            <button
              onClick={() => setChatMode(chatMode === 'closed' ? 'open' : 'closed')}
              className={`p-2 rounded-lg transition-colors ${chatMode !== 'closed' ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'}`}
              title="Toggle chat"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 md:px-6 pb-2">
          <div className="flex-1">
            <Outlet />
          </div>
          <Branding className="mt-4" />
        </div>
      </main>

      <ChatPanel />
      <FederationPanel open={federationPanelOpen} onClose={() => setFederationPanelOpen(false)} />
      <ToastContainer />
    </div>
  )
}
