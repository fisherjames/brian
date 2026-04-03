import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Rocket,
  Play,
  CheckCircle2,
  GitMerge,
  Ship,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Hand,
  Square,
  GitBranch,
  Terminal,
  Circle,
  Send,
  Sparkles,
} from 'lucide-react'
import { useMcp } from '../../hooks/useMcp'
import { useWebSocket } from '../../hooks/useWebSocket'

type Phase = 'idle' | 'ready' | 'working' | 'verifying' | 'merging' | 'shipping' | 'done'

interface VerificationResult {
  name: string
  ok: boolean
  output: string
}

interface TaskItem {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
}

interface RunState {
  taskId: string
  branch: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  output: string[]
}

export function MissionControl({ brainId }: { brainId: string }) {
  const { call, connected } = useMcp()
  const { subscribe } = useWebSocket()
  const [phase, setPhase] = useState<Phase>('idle')
  const [intentText, setIntentText] = useState('')
  const [submittingIntent, setSubmittingIntent] = useState(false)
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [runState, setRunState] = useState<RunState>({
    taskId: '',
    branch: '',
    status: 'idle',
    output: [],
  })
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'agent.output' && typeof msg.line === 'string') {
        setRunState((prev) => ({
          ...prev,
          output: [...prev.output, msg.line as string],
        }))
      }
    })
  }, [subscribe])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [runState.output])

  const refreshTasks = useCallback(async () => {
    const r = await call<{ tasks: TaskItem[] }>('team.get_tasks', {}, brainId).catch(() => ({
      tasks: [],
    }))
    setTasks(r.tasks ?? [])
    return r.tasks ?? []
  }, [call, brainId])

  useEffect(() => {
    if (!connected) return

    refreshTasks().then((loadedTasks) => {
      const hasTodo = loadedTasks.some((t) => t.status === 'todo')
      if (hasTodo) setPhase('ready')
    })

    call<RunState>('team.get_run_state', {}, brainId)
      .then((r) => {
        if (r.status === 'running') {
          setRunState(r)
          setPhase('working')
        }
      })
      .catch(() => {})
  }, [connected, call, brainId, refreshTasks])

  const handleSubmitIntent = useCallback(async () => {
    if (!intentText.trim()) return
    setSubmittingIntent(true)
    setError(null)
    try {
      await call<{ status: string; intentId: string }>(
        'company.intent.capture',
        { description: intentText.trim() },
        brainId,
      )
      setIntentText('')
      await refreshTasks()
      setPhase('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to capture intent')
    } finally {
      setSubmittingIntent(false)
    }
  }, [call, brainId, intentText, refreshTasks])

  const handleReady = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await call('team.set_live_demo_gate', { ready: true }, brainId)
      setPhase('working')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [call, brainId])

  const handleStartWork = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRunState((prev) => ({ ...prev, output: [], status: 'running' }))
    try {
      const result = await call<{
        status: string
        task: TaskItem
        branch: string
        agentStatus: string
      }>('team.start_next_task', {}, brainId)
      setRunState((prev) => ({
        ...prev,
        taskId: result.task?.id ?? '',
        branch: result.branch ?? '',
        status: 'running',
      }))
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start')
      setRunState((prev) => ({ ...prev, status: 'failed' }))
    } finally {
      setLoading(false)
    }
  }, [call, brainId, refreshTasks])

  const handleStopWork = useCallback(async () => {
    try {
      await call('team.stop_task', {}, brainId)
      setRunState((prev) => ({ ...prev, status: 'failed' }))
    } catch {
      /* ignore */
    }
  }, [call, brainId])

  const handleAdvanceToVerify = useCallback(() => {
    setPhase('verifying')
  }, [])

  const handleVerify = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await call<{ gates: VerificationResult[]; allPassed: boolean }>(
        'team.run_verification_suite',
        {},
        brainId,
      )
      setVerificationResults(result.gates ?? [])
      if (result.allPassed) setPhase('merging')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }, [call, brainId])

  const handleMerge = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dryRun = await call<{ canMerge: boolean; conflicts: string[] }>(
        'team.merge_queue_dry_run',
        {},
        brainId,
      )
      if (!dryRun.canMerge) {
        setError(`Merge conflicts: ${dryRun.conflicts.join(', ')}`)
        return
      }
      await call('team.merge_queue_execute', {}, brainId)
      await call('team.complete_task', {}, brainId)
      await refreshTasks()
      setPhase('shipping')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setLoading(false)
    }
  }, [call, brainId, refreshTasks])

  const handleShip = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await call('team.merge_queue_ship', {}, brainId)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ship failed')
    } finally {
      setLoading(false)
    }
  }, [call, brainId])

  const handleReset = useCallback(async () => {
    setRunState({ taskId: '', branch: '', status: 'idle', output: [] })
    setVerificationResults([])
    setError(null)
    const updated = await refreshTasks()
    const hasTodo = updated.some((t) => t.status === 'todo')
    setPhase(hasTodo ? 'ready' : 'idle')
  }, [refreshTasks])

  const phases: { id: Phase; label: string; icon: React.ReactNode }[] = [
    { id: 'idle', label: 'Intent', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'ready', label: 'Ready', icon: <Hand className="h-4 w-4" /> },
    { id: 'working', label: 'Execute', icon: <Play className="h-4 w-4" /> },
    { id: 'verifying', label: 'Verify', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'merging', label: 'Merge', icon: <GitMerge className="h-4 w-4" /> },
    { id: 'shipping', label: 'Ship', icon: <Ship className="h-4 w-4" /> },
    { id: 'done', label: 'Done', icon: <CheckCircle2 className="h-4 w-4" /> },
  ]

  const phaseIndex = phases.findIndex((p) => p.id === phase)

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center gap-3">
        <Rocket className="h-6 w-6 text-emerald-400" />
        <h2 className="text-xl font-bold text-zinc-100">Mission Control</h2>
        {runState.branch && (
          <span className="flex items-center gap-1 rounded-full bg-violet-900/30 px-2 py-0.5 text-xs text-violet-300">
            <GitBranch className="h-3 w-3" />
            {runState.branch}
          </span>
        )}
        {!connected && (
          <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs text-red-300">
            Disconnected
          </span>
        )}
      </div>

      {/* Phase ribbon */}
      <div className="mb-4 flex items-center gap-1 overflow-x-auto">
        {phases.map((p, i) => (
          <div key={p.id} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                i < phaseIndex
                  ? 'border-emerald-800 bg-emerald-900/20 text-emerald-400'
                  : i === phaseIndex
                    ? 'border-blue-700 bg-blue-900/30 text-blue-400'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-600'
              }`}
            >
              {p.icon}
              {p.label}
            </div>
            {i < phases.length - 1 && <div className="h-px w-4 bg-zinc-800" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded border border-red-800 bg-red-900/20 p-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: tasks + controls */}
        <div className="flex w-72 shrink-0 flex-col gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">Execution Plan</h3>
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  {t.status === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : t.status === 'in_progress' || t.id === runState.taskId ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  )}
                  <span
                    className={
                      t.status === 'done'
                        ? 'text-zinc-500 line-through'
                        : t.id === runState.taskId
                          ? 'text-blue-300'
                          : 'text-zinc-300'
                    }
                  >
                    {t.title}
                  </span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-xs text-zinc-600">No tasks in execution plan.</p>
              )}
            </div>
          </div>

          {/* Intent input */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-300">New Intent</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={intentText}
                onChange={(e) => setIntentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitIntent()
                  }
                }}
                placeholder="Describe what you want built..."
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
              <button
                onClick={handleSubmitIntent}
                disabled={submittingIntent || !intentText.trim()}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {submittingIntent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Action panel */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            {phase === 'idle' && (
              <p className="text-center text-sm text-zinc-500">
                Enter an intent above to generate tasks.
              </p>
            )}

            {phase === 'ready' && (
              <button
                onClick={handleReady}
                disabled={loading || tasks.filter((t) => t.status === 'todo').length === 0}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "I'm Ready"}
              </button>
            )}

            {phase === 'working' && runState.status === 'idle' && (
              <button
                onClick={handleStartWork}
                disabled={loading || tasks.filter((t) => t.status === 'todo').length === 0}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  'Start Next Task'
                )}
              </button>
            )}

            {phase === 'working' && runState.status === 'running' && (
              <button
                onClick={handleStopWork}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <Square className="h-4 w-4" />
                Stop Agent
              </button>
            )}

            {phase === 'working' &&
              (runState.status === 'completed' || runState.status === 'failed') && (
                <div className="space-y-2">
                  <div
                    className={`rounded p-2 text-center text-sm font-medium ${
                      runState.status === 'completed'
                        ? 'bg-emerald-900/30 text-emerald-300'
                        : 'bg-red-900/30 text-red-300'
                    }`}
                  >
                    Agent {runState.status}
                  </div>
                  <button
                    onClick={handleAdvanceToVerify}
                    className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
                  >
                    Run Verification
                  </button>
                </div>
              )}

            {phase === 'verifying' && (
              <div className="space-y-2">
                {verificationResults.length > 0 && (
                  <div className="space-y-1">
                    {verificationResults.map((r) => (
                      <div
                        key={r.name}
                        className="flex items-center gap-2 rounded border border-zinc-800 p-1.5 text-xs"
                      >
                        {r.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span className="text-zinc-300">{r.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleVerify}
                  disabled={loading}
                  className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    'Run Verification Suite'
                  )}
                </button>
              </div>
            )}

            {phase === 'merging' && (
              <button
                onClick={handleMerge}
                disabled={loading}
                className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  'Merge to Main'
                )}
              </button>
            )}

            {phase === 'shipping' && (
              <button
                onClick={handleShip}
                disabled={loading}
                className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Push to Remote'}
              </button>
            )}

            {phase === 'done' && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 rounded bg-emerald-900/30 p-2 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Shipped
                </div>
                <button
                  onClick={handleReset}
                  className="w-full rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
                >
                  Next Task
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: agent output terminal */}
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
            <Terminal className="h-4 w-4 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-400">Agent Output</span>
            {runState.status === 'running' && (
              <span className="ml-auto flex items-center gap-1 text-xs text-blue-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Running
              </span>
            )}
          </div>
          <div
            ref={outputRef}
            className="flex-1 overflow-auto p-4 font-mono text-xs leading-5 text-zinc-400"
          >
            {runState.output.length === 0 ? (
              <p className="text-zinc-600">
                Agent output will appear here when a task is started...
              </p>
            ) : (
              runState.output.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith('[engine]')
                      ? 'text-blue-400'
                      : line.startsWith('[stderr]')
                        ? 'text-red-400'
                        : 'text-zinc-300'
                  }
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
