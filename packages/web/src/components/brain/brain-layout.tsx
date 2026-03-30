'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { FileTree } from './file-tree';
import TabBar, { type Tab } from './tab-bar';
import FileViewer from './file-viewer';
import RightPane from './right-pane';
import TeamTracker from './team-tracker';
import CeoOverview from './ceo-overview';
import TribeDirection from './tribe-direction';
import DirectorConsole from './director-console';
import AgentsWorkflow from './agents-workflow';
import WorkflowRibbon from './workflow-ribbon';
import { ConnectionStatusIndicator } from './connection-status';
import { ShareButton } from './share-button';
import BrainLoader from './brain-loader';
import { useBrainRealtime } from '@/hooks/use-brain-realtime';

const GraphView = dynamic(() => import('./graph-view'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" style={{ backgroundColor: '#F2F1EA' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-text/5" />
        <p className="text-[13px] text-text-muted">Loading graph...</p>
      </div>
    </div>
  ),
});

interface BrainFile { id: string; path: string; }
interface BrainLink { source_file_id: string; target_path: string; }
interface ExecutionStep {
  id: string; phase_number: number; step_number: number; title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  tasks_json: Array<{ done: boolean; text: string }> | null;
}
interface Handoff {
  id: string; session_number: number; date: string; created_at: string | null;
  duration_seconds: number | null; summary: string; file_path: string;
}

interface BrainLayoutProps {
  brainId: string; files: BrainFile[]; links: BrainLink[];
  executionSteps: ExecutionStep[]; handoffs: Handoff[];
  brainName?: string; brainDescription?: string;
}

const GRAPH_TAB: Tab = { id: 'graph', label: 'Graph + Notes' };
const TEAM_TAB: Tab = { id: 'mission-control', label: 'Mission Control' };
const TRIBE_TAB: Tab = { id: 'tribe-direction', label: 'Tribe View' };
const DIRECTORS_TAB: Tab = { id: 'directors', label: 'Director View' };
const MISSION_TAB: Tab = { id: 'mission', label: 'CEO View' };
const AGENTS_TAB: Tab = { id: 'agents-workflow', label: 'Agents + Workflow' };

export function BrainLayout({
  brainId, files: initialFiles, links: initialLinks,
  executionSteps: initialSteps, handoffs: initialHandoffs,
  brainName = '', brainDescription = '',
}: BrainLayoutProps) {
  const initialData = useMemo(() => ({
    files: initialFiles, links: initialLinks,
    executionSteps: initialSteps, handoffs: initialHandoffs,
  }), [initialFiles, initialLinks, initialSteps, initialHandoffs]);

  const { files, links, executionSteps, handoffs, connectionStatus, isStreaming, optimisticUpdateStep, refreshSnapshot } =
    useBrainRealtime(brainId, initialData);

  // Show build loader only while streaming initial scaffold updates.
  const isBuilding = isStreaming && files.length > 0 && files.length < 5;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPaneOpen, setRightPaneOpen] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
        setRightPaneOpen(false);
        setRightPaneCollapsed(true);
      } else {
        setRightPaneCollapsed(false);
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const [activeTabId, setActiveTabId] = useState('mission');
  const [tabs, setTabs] = useState<Tab[]>([MISSION_TAB, DIRECTORS_TAB, TRIBE_TAB, TEAM_TAB, GRAPH_TAB, AGENTS_TAB]);
  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    if (!requestedTab) return
    if (
      requestedTab === 'graph' ||
      requestedTab === 'mission-control' ||
      requestedTab === 'tribe-direction' ||
      requestedTab === 'directors' ||
      requestedTab === 'mission' ||
      requestedTab === 'agents-workflow'
    ) {
      setActiveTabId(requestedTab)
    }
  }, [])

  useEffect(() => {
    if (!isMobile) return;
    setSidebarOpen(false);
    setRightPaneOpen(false);
  }, [activeTabId, isMobile]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const handleToggleStep = useCallback(
    async (stepId: string, currentStatus: string) => {
      const newStatus = currentStatus === 'completed' ? 'not_started' : 'completed';
      optimisticUpdateStep(stepId, newStatus as 'not_started' | 'completed');
      try {
        const res = await fetch(`/api/brain-step/${brainId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId, status: newStatus }),
        });
        if (!res.ok) {
          optimisticUpdateStep(stepId, currentStatus as ExecutionStep['status']);
        }
      } catch {
        optimisticUpdateStep(stepId, currentStatus as ExecutionStep['status']);
      }
    },
    [brainId, optimisticUpdateStep]
  );

  const pathToFile = new Map<string, BrainFile>();
  for (const f of files) {
    pathToFile.set(f.path, f);
    const noExt = f.path.replace(/\.md$/, '');
    if (!pathToFile.has(noExt)) pathToFile.set(noExt, f);
    const name = f.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    if (name && !pathToFile.has(name)) pathToFile.set(name, f);
  }

  function openFileTab(fileId: string, filePath: string) {
    const existing = tabs.find((t) => t.id === fileId);
    if (!existing) {
      const label = filePath.split('/').pop()?.replace(/\.md$/, '') ?? filePath;
      setTabs((prev) => [...prev, { id: fileId, label, path: filePath }]);
    }
    setActiveTabId(fileId);
    if (!fileContents.has(fileId)) loadFileContent(fileId, filePath);
  }

  async function loadFileContent(fileId: string, filePath: string) {
    setLoadingFile(fileId);
    try {
      const res = await fetch(`/api/brain-file/${brainId}?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const text = await res.text();
        setFileContents((prev) => new Map(prev).set(fileId, text));
      } else {
        setFileContents((prev) => new Map(prev).set(fileId, '*Unable to load file content.*'));
      }
    } catch {
      setFileContents((prev) => new Map(prev).set(fileId, '*Unable to load file content.*'));
    }
    setLoadingFile(null);
  }

  function handleCloseTab(tabId: string) {
    if (tabId === 'graph' || tabId === 'mission-control' || tabId === 'tribe-direction' || tabId === 'directors' || tabId === 'mission' || tabId === 'agents-workflow') return;
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('graph');
  }

  function handleCloseOthers(tabId: string) {
    setTabs((prev) => prev.filter((t) => t.id === 'graph' || t.id === 'mission-control' || t.id === 'tribe-direction' || t.id === 'directors' || t.id === 'mission' || t.id === 'agents-workflow' || t.id === tabId));
    if (activeTabId !== tabId && activeTabId !== 'graph' && activeTabId !== 'mission-control' && activeTabId !== 'tribe-direction' && activeTabId !== 'directors' && activeTabId !== 'mission' && activeTabId !== 'agents-workflow') setActiveTabId(tabId);
  }

  function handleCloseToRight(tabId: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      return prev.slice(0, idx + 1);
    });
    const idx = tabs.findIndex((t) => t.id === tabId);
    const activeIdx = tabs.findIndex((t) => t.id === activeTabId);
    if (activeIdx > idx) setActiveTabId(tabId);
  }

  function handleWikilinkClick(targetPath: string) {
    const file = pathToFile.get(targetPath);
    if (file) openFileTab(file.id, file.path);
  }

  function handleOpenRecord(pathOrTarget: string) {
    const target = pathOrTarget.replace(/^\//, '').replace(/\.md$/i, '')
    const file = pathToFile.get(pathOrTarget) ?? pathToFile.get(target) ?? pathToFile.get(`${target}.md`)
    if (file) openFileTab(file.id, file.path)
  }

  function handleSelectHandoff(fileId: string, filePath: string) {
    openFileTab(fileId, filePath);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeFileContent = activeTabId !== 'graph' ? fileContents.get(activeTabId) : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />}
      {rightPaneOpen && <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setRightPaneOpen(false)} />}

      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:hidden'} fixed z-30 flex h-[calc(100vh-82px)] w-[250px] flex-col border-r border-border bg-bg/80 backdrop-blur-sm transition-transform duration-200 md:relative md:z-auto md:h-auto ${!sidebarOpen ? 'md:w-0 md:border-r-0' : ''}`}>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[12px] font-medium uppercase tracking-wider text-text-muted">Files</span>
          <button onClick={() => setSidebarOpen(false)} className="rounded p-1 text-text-muted transition-colors hover:bg-text/5 hover:text-text-secondary">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          <FileTree files={files} selectedFileId={activeTabId !== 'graph' ? activeTabId : null} onSelectFile={(id, path) => { openFileTab(id, path); if (isMobile) setSidebarOpen(false); }} />
        </div>
      </aside>

      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} className="fixed left-2 top-[60px] z-20 rounded-md border border-border bg-bg/80 p-1.5 text-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-text/5 hover:text-text-secondary md:relative md:left-0 md:top-0 md:mt-2 md:ml-2">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        {isMobile ? (
          <div className="flex items-center gap-2 border-b border-border bg-bg/85 px-3 py-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md border border-border px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-text/5"
            >
              Files
            </button>
            <label htmlFor="mobile-tab-select" className="sr-only">
              Select tab
            </label>
            <select
              id="mobile-tab-select"
              value={activeTabId}
              onChange={(event) => setActiveTabId(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-[12px] text-text"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setRightPaneOpen(true)}
              className="rounded-md border border-border px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-text/5"
            >
              Plan
            </button>
          </div>
        ) : (
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelectTab={setActiveTabId} onCloseTab={handleCloseTab} onCloseOthers={handleCloseOthers} onCloseToRight={handleCloseToRight} />
        )}
        <WorkflowRibbon brainId={brainId} activeTabId={activeTabId} />

        <div className="relative flex-1 overflow-y-auto">
          {activeTabId === 'graph' && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              {connectionStatus === 'connected' && !isStreaming && (
                <ShareButton brainName={brainName} brainDescription={brainDescription} fileCount={files.length}
                  departmentCount={new Set(files.filter((f) => f.path.includes('/')).map((f) => f.path.split('/')[0])).size}
                  linkCount={links.length} files={files} links={links} />
              )}
              <ConnectionStatusIndicator status={connectionStatus} isStreaming={isStreaming} fileCount={isStreaming ? files.length : undefined} />
            </div>
          )}
          {activeTabId === 'graph' && isBuilding ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <BrainLoader />
              <p className="mt-2 text-[14px] font-medium text-text-secondary">Your brain is being built...</p>
              <p className="text-[12px] text-text-muted">{files.length} files created so far. Watching for changes.</p>
            </div>
          ) : activeTabId === 'graph' ? (
            <GraphView files={files} links={links} onSelectFile={openFileTab} />
          ) : activeTabId === 'mission-control' ? (
            <TeamTracker
              brainId={brainId}
              executionSteps={executionSteps}
              handoffs={handoffs}
              refreshSnapshot={refreshSnapshot}
            />
          ) : activeTabId === 'tribe-direction' ? (
            <TribeDirection brainId={brainId} onOpenRecord={handleOpenRecord} />
          ) : activeTabId === 'directors' ? (
            <DirectorConsole brainId={brainId} onOpenRecord={handleOpenRecord} />
          ) : activeTabId === 'mission' ? (
            <CeoOverview brainId={brainId} onOpenRecord={handleOpenRecord} />
          ) : activeTabId === 'agents-workflow' ? (
            <AgentsWorkflow brainId={brainId} />
          ) : loadingFile === activeTabId ? (
            <BrainLoader />
          ) : activeFileContent ? (
            <FileViewer content={activeFileContent} filePath={activeTab?.path ?? ''} onWikilinkClick={handleWikilinkClick} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px] text-text-muted">Select a file to view</p>
            </div>
          )}
        </div>
      </main>

      <button onClick={() => setRightPaneOpen(!rightPaneOpen)} className="fixed bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg/90 shadow-lg backdrop-blur-sm transition-colors hover:bg-text/5 lg:hidden" title="Execution Plan">
        {rightPaneOpen ? <PanelRightClose className="h-4 w-4 text-leaf" /> : <PanelRightOpen className="h-4 w-4 text-text-muted" />}
      </button>

      <div className={`${rightPaneOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} fixed right-0 top-0 z-30 h-full transition-all duration-200 lg:relative lg:z-auto lg:h-auto ${rightPaneCollapsed ? 'lg:w-auto' : 'w-[92vw] max-w-[360px] lg:w-[280px] lg:max-w-none'}`}>
        <RightPane executionSteps={executionSteps} handoffs={handoffs} onToggleStep={handleToggleStep}
          onSelectHandoff={(id, path) => { handleSelectHandoff(id, path); setRightPaneOpen(false); }}
          collapsed={rightPaneCollapsed} onToggleCollapsed={() => setRightPaneCollapsed((c) => !c)} />
      </div>
    </div>
  );
}
