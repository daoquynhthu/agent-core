/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, createSignal, onCleanup } from "solid-js"

const id = "internal:agent-status-bar"

function deriveTier(modelId: string): string {
  const id = modelId.toLowerCase()
  const t3 = ["mini", "nano", "tiny", "small", "3b", "1b", "8b", "2b"]
  const t2 = ["flash", "sonnet", "medium", "haiku"]
  if (id.includes("claude-opus") || id.includes("claude-4") || (id.includes("gpt-4o") && !id.includes("mini")) || id.includes("gpt-4.1") || id.includes("gemini-2.5-pro")) return "T1"
  if (t3.some((k) => id.includes(k))) return "T3"
  if (t2.some((k) => id.includes(k))) return "T2"
  return "T1"
}

function View(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const [busyCount, setBusyCount] = createSignal(0)

  onCleanup(
    props.api.event.on("session.status", (event) => {
      const t = event.properties.status.type
      if (t === "busy" || t === "retry") setBusyCount((c) => c + 1)
      else if (t === "idle") setBusyCount((c) => Math.max(0, c - 1))
    }),
  )

  const badge = createMemo(() => {
    const model = (props.api.state.provider[0]?.models ? Object.keys(props.api.state.provider[0].models)[0] ?? "" : "")
    return deriveTier(model)
  })

  const statusColor = createMemo(() => {
    const b = busyCount()
    if (b > 0) return theme().warning
    if (props.api.state.session.count() === 0) return theme().textMuted
    return theme().success
  })

  const statusLabel = createMemo(() => {
    const b = busyCount()
    if (b > 0) return `busy (${b})`
    if (props.api.state.session.count() === 0) return "ready"
    return "idle"
  })

  const badgeColor = createMemo(() => {
    if (badge() === "T1") return theme().success
    if (badge() === "T2") return theme().warning
    if (badge() === "T3") return theme().error
    return theme().textMuted
  })

  return (
    <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
      <text fg={statusColor()}>{statusLabel()}</text>
      <text fg={theme().textMuted}>|</text>
      <text fg={badgeColor()}>
        <b>{badge()}</b>
      </text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 1000,
    slots: {
      app_bottom() {
        return <View api={api} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
