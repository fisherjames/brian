'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMcpTeam } from '@/hooks/use-mcp-team'

type LabStateResult = {
  specialists?: string[]
}

type EditorPane = {
  path: string
  title: string
  value: string
  loading: boolean
  dirty: boolean
}

export default function AgentsWorkflow({ brainId }: { brainId: string }) {
  const { call, connected } = useMcpTeam(brainId)
  const [specialists, setSpecialists] = useState<string[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [codexSkills, setCodexSkills] = useState<string[]>([])
  const [selectedSkill, setSelectedSkill] = useState('')
  const [agentPane, setAgentPane] = useState<EditorPane>({
    path: '',
    title: 'Agent',
    value: '',
    loading: false,
    dirty: false,
  })
  const [skillPane, setSkillPane] = useState<EditorPane>({
    path: '',
    title: 'Codex Skill',
    value: '',
    loading: false,
    dirty: false,
  })
  const [rulesPane, setRulesPane] = useState<EditorPane>({
    path: 'brian/org/rules.md',
    title: 'Rules',
    value: '',
    loading: false,
    dirty: false,
  })
  const [error, setError] = useState('')

  const loadPath = useCallback(async (path: string): Promise<string> => {
    const res = await fetch(`/api/brain-file/${brainId}?path=${encodeURIComponent(path)}&optional=1`, { cache: 'no-store' })
    if (res.ok) return await res.text()
    return ''
  }, [brainId])

  const savePath = useCallback(async (path: string, content: string) => {
    const res = await fetch(`/api/brain-file/${brainId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || 'save_failed')
    }
  }, [brainId])

  const loadCodexSkill = useCallback(async (skillName: string): Promise<string> => {
    const res = await fetch(`/api/codex-skills?name=${encodeURIComponent(skillName)}`, { cache: 'no-store' })
    if (res.ok) return await res.text()
    throw new Error('failed_to_load_skill')
  }, [])

  const saveCodexSkill = useCallback(async (skillName: string, content: string) => {
    const res = await fetch('/api/codex-skills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: skillName, content }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || 'save_failed')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!connected) return
      const lab = await call<LabStateResult>('lab.state.get', {})
      const nextSpecialists = Array.isArray(lab.result?.specialists) ? lab.result?.specialists : []
      if (cancelled) return
      setSpecialists(nextSpecialists)
      if (!selectedAgent && nextSpecialists.length > 0) {
        setSelectedAgent(nextSpecialists[0])
      }
    }
    void load()
    return () => { cancelled = true }
  }, [call, connected, selectedAgent])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/codex-skills', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { skills?: string[] }
        const skills = Array.isArray(json.skills) ? json.skills : []
        if (cancelled) return
        setCodexSkills(skills)
        if (!selectedSkill && skills.length > 0) setSelectedSkill(skills[0])
      } catch {
        // ignore and keep fallback UI state
      }
    }
    void load()
    return () => { cancelled = true }
  }, [selectedSkill])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!selectedAgent) return
      const path = `brian/agents/${selectedAgent}.md`
      setAgentPane((prev) => ({ ...prev, path, loading: true }))
      const value = await loadPath(path)
      if (cancelled) return
      setAgentPane({ path, title: selectedAgent, value, loading: false, dirty: false })
    }
    void load()
    return () => { cancelled = true }
  }, [loadPath, selectedAgent])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!selectedSkill) return
      setSkillPane((prev) => ({ ...prev, path: selectedSkill, title: selectedSkill, loading: true }))
      try {
        const value = await loadCodexSkill(selectedSkill)
        if (cancelled) return
        setSkillPane({ path: selectedSkill, title: selectedSkill, value, loading: false, dirty: false })
      } catch {
        if (cancelled) return
        setSkillPane({ path: selectedSkill, title: selectedSkill, value: '', loading: false, dirty: false })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loadCodexSkill, selectedSkill])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setRulesPane((prev) => ({ ...prev, loading: true }))
      const rules = await loadPath('brian/org/rules.md')
      if (cancelled) return
      setRulesPane((prev) => ({ ...prev, value: rules || '# rules\n\n', loading: false, dirty: false }))
    }
    void load()
    return () => { cancelled = true }
  }, [loadPath])

  const savePane = useCallback(async (pane: EditorPane, setPane: (updater: (prev: EditorPane) => EditorPane) => void) => {
    setError('')
    try {
      await savePath(pane.path, pane.value)
      setPane((prev) => ({ ...prev, dirty: false }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save_failed')
    }
  }, [savePath])

  return (
    <div className="h-full overflow-y-auto bg-[#F7F6F1] p-4 text-[13px] text-text">
      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-text-muted">Agents + Workflow</div>
            <div className="text-[12px] text-text-secondary">Manage agent notes, real Codex skills, and Brian rules in one control surface.</div>
          </div>
          <div className={`rounded px-2 py-1 text-[11px] ${connected ? 'bg-[#5B9A65]/10 text-[#5B9A65]' : 'bg-[#D95B5B]/10 text-[#D95B5B]'}`}>
            {connected ? 'MCP connected' : 'MCP offline'}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Agents</div>
        <div className="mb-2 text-[12px] text-text-secondary">Select an agent and edit its markdown note directly.</div>
        <div className="mb-2 flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="min-w-[220px] rounded border border-border px-2 py-1.5 text-[12px]"
          >
            {specialists.length === 0 && <option value="">No agents available</option>}
            {specialists.map((agent) => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>
          <button
            disabled={!agentPane.path || agentPane.loading || !agentPane.dirty}
            onClick={() => void savePane(agentPane, setAgentPane)}
            className="rounded border border-border px-2 py-1.5 text-[12px] disabled:opacity-50"
          >
            Save Agent
          </button>
        </div>
        <textarea
          value={agentPane.value}
          onChange={(e) => setAgentPane((prev) => ({ ...prev, value: e.target.value, dirty: true }))}
          className="h-[260px] w-full rounded border border-border/70 bg-[#FCFCFA] p-2 font-mono text-[12px]"
        />
      </div>

      <div className="rounded border border-border bg-white p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">Workflow</div>
        <div className="mb-2 text-[12px] text-text-secondary">Edit real Codex skill files and Brian workflow rules.</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-border/70 bg-[#FCFCFA] p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Codex Skill</div>
              <button
                disabled={!selectedSkill || skillPane.loading || !skillPane.dirty}
                onClick={async () => {
                  setError('')
                  try {
                    await saveCodexSkill(selectedSkill, skillPane.value)
                    setSkillPane((prev) => ({ ...prev, dirty: false }))
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'save_failed')
                  }
                }}
                className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
              >
                Save Skill
              </button>
            </div>
            <div className="mb-2 text-[11px] text-text-muted">Edits `~/.codex/skills/&lt;skill&gt;/SKILL.md`.</div>
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="mb-2 w-full rounded border border-border px-2 py-1.5 text-[12px]"
            >
              {codexSkills.length === 0 && <option value="">No codex skills found</option>}
              {codexSkills.map((skill) => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>
            <textarea
              value={skillPane.value}
              onChange={(e) => setSkillPane((prev) => ({ ...prev, value: e.target.value, dirty: true }))}
              className="h-[260px] w-full rounded border border-border/70 bg-white p-2 font-mono text-[12px]"
            />
          </div>
          <div className="rounded border border-border/70 bg-[#FCFCFA] p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Rules</div>
              <button
                disabled={rulesPane.loading || !rulesPane.dirty}
                onClick={() => void savePane(rulesPane, setRulesPane)}
                className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
              >
                Save Rules
              </button>
            </div>
            <textarea
              value={rulesPane.value}
              onChange={(e) => setRulesPane((prev) => ({ ...prev, value: e.target.value, dirty: true }))}
              className="h-[260px] w-full rounded border border-border/70 bg-white p-2 font-mono text-[12px]"
            />
          </div>
        </div>
      </div>

      {error && <div className="mt-3 rounded border border-[#D95B5B]/40 bg-[#D95B5B]/10 p-2 text-[12px] text-[#D95B5B]">{error}</div>}
    </div>
  )
}
