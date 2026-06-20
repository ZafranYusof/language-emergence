
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Radio, GitBranch, Settings, History,
  ChevronLeft, ChevronRight, Zap, Wifi, WifiOff,
  GitCompare, Grid3X3, TreePine, Eye,
  Sun, Moon, Swords, BookKey, Gamepad2, Brain, Monitor, Users,
 Clapperboard, Mic, ArrowLeftRight,
  TrendingUp, Sparkles, Network, Languages, ScrollText, MessageSquare,
  Bug,
} from 'lucide-react';

/* Eager imports (first-paint critical) */
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen from './components/LoadingScreen';

/* Lazy imports (code-split: loaded on demand) */
const LiveFeed = React.lazy(() => import('./components/LiveFeed'));
const LanguageAnalysis = React.lazy(() => import('./components/LanguageAnalysis'));
const EnvironmentEditor = React.lazy(() => import('./components/EnvironmentEditor'));
const ReplaySystem = React.lazy(() => import('./components/ReplaySystem'));
const SessionComparison = React.lazy(() => import('./pages/SessionComparison'));
const MessageHeatmap = React.lazy(() => import('./pages/MessageHeatmap'));
const PhylogeneticTree = React.lazy(() => import('./pages/PhylogeneticTree'));
const AgentAttention = React.lazy(() => import('./pages/AgentAttention'));
const CommunicationArena = React.lazy(() => import('./pages/CommunicationArena'));
const SymbolDecoder = React.lazy(() => import('./pages/SymbolDecoder'));
const Playground = React.lazy(() => import('./pages/Playground'));
const AgentMinds = React.lazy(() => import('./pages/AgentMinds'));
const DesktopAccess = React.lazy(() => import('./pages/DesktopAccess'));
const AgentWorkspace = React.lazy(() => import('./pages/AgentWorkspace'));
const DemoMode = React.lazy(() => import('./pages/DemoMode'));
const VoiceControls = React.lazy(() => import('./pages/VoiceControls'));
const TrainingComparison = React.lazy(() => import('./pages/TrainingComparison'));
const LanguageEvolution = React.lazy(() => import('./pages/LanguageEvolution'));
const AgentSpecialization = React.lazy(() => import('./pages/AgentSpecialization'));
const SocialDynamics = React.lazy(() => import('./pages/SocialDynamics'));
const MemoryVisualization = React.lazy(() => import('./pages/MemoryVisualization'));
const TranslationPanel = React.lazy(() => import('./pages/TranslationPanel'));
const TrainingNarrator = React.lazy(() => import('./pages/TrainingNarrator'));
const NeuralVisualizer = React.lazy(() => import('./pages/NeuralVisualizer'));
const WorldSimulation = React.lazy(() => import('./pages/WorldSimulation'));
const HumanFeedback = React.lazy(() => import('./pages/HumanFeedback'));
const SwarmIntelligence = React.lazy(() => import('./pages/SwarmIntelligence'));

import { useTraining } from './hooks/useTraining';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '1' },
  { id: 'live', label: 'Live Feed', icon: Radio, shortcut: '2' },
  { id: 'analysis', label: 'Language Analysis', icon: GitBranch, shortcut: '3' },
  { id: 'comparison', label: 'Comparison', icon: GitCompare, shortcut: '4' },
  { id: 'heatmap', label: 'Heatmap', icon: Grid3X3, shortcut: '5' },
  { id: 'phylogeny', label: 'Phylogeny', icon: TreePine, shortcut: '6' },
  { id: 'attention', label: 'Attention', icon: Eye, shortcut: '7' },
  { id: 'arena', label: 'Arena', icon: Swords, shortcut: '8' },
  { id: 'decoder', label: 'Decoder', icon: BookKey, shortcut: '9' },
  { id: 'playground', label: 'Playground', icon: Gamepad2, shortcut: 'p' },
  { id: 'minds', label: 'Minds', icon: Brain, shortcut: '0' },
  { id: 'editor', label: 'Environment', icon: Settings, shortcut: 'e' },
  { id: 'replay', label: 'Replay', icon: History, shortcut: 'r' },
  { id: 'desktop', label: 'Desktop', icon: Monitor, shortcut: '-' },
  { id: 'workspace', label: 'Workspace', icon: Users, shortcut: '=' },
  { id: 'demo-mode', label: 'Demo Mode', icon: Clapperboard, shortcut: 'd' },
  { id: 'voice-controls', label: 'Voice Controls', icon: Mic, shortcut: 'v' },
  { id: 'training-comparison', label: 'Training Comparison', icon: ArrowLeftRight, shortcut: 't' },
  { id: 'language-evolution', label: 'Language Evolution', icon: TrendingUp, shortcut: 'l' },
  { id: 'agent-specialization', label: 'Specialization', icon: Sparkles, shortcut: 's' },
  { id: 'social-dynamics', label: 'Social Dynamics', icon: Network, shortcut: 'g' },
  { id: 'memory-viz', label: 'Memory Map', icon: Brain, shortcut: 'm' },
  { id: 'translation', label: 'Translation', icon: Languages, shortcut: 'q' },
  { id: 'narrator', label: 'Narrator', icon: ScrollText, shortcut: 'n' },
  { id: 'neural-viz', label: 'Neural Viz', icon: Brain, shortcut: 'i' },
  { id: 'world-sim', label: 'World Sim', icon: Gamepad2, shortcut: 'w' },
  { id: 'human-feedback', label: 'Human Feedback', icon: MessageSquare, shortcut: 'f' },
  { id: 'swarm', label: 'Swarm Intel', icon: Bug, shortcut: 'x' },
];

/* ──────────────────────────── Transition presets ──────────────────────────── */

const pageTransitions = {
  fade: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  slide: {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.05 },
  },
};

const DEFAULT_TRANSITION = 'fade';
const PAGE_ENTER_DURATION = 0.3;
const PAGE_EXIT_DURATION = 0.2;
const SKELETON_MIN_DURATION = 300; // ms

/* ──────────────────────────── Skeleton Components ──────────────────────────── */

function SkeletonBar({ width = '100%', height = 16, style = {} }) {
  return (
    <div
      className="skeleton-shimmer rounded"
      style={{ width, height, ...style }}
    />
  );
}

function SkeletonMetricCard() {
  return (
    <div className="rounded-lg border border-steel-border bg-steel-dark/50 p-4 space-y-3">
      <SkeletonBar width="40%" height={12} />
      <SkeletonBar width="60%" height={28} />
      <SkeletonBar width="80%" height={10} />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="rounded-lg border border-steel-border bg-steel-dark/50 p-4 space-y-3">
      <SkeletonBar width="30%" height={14} />
      <div className="flex items-end gap-2 h-32 pt-4">
        {[40, 65, 50, 80, 55, 70, 45].map((h, i) => (
          <div key={i} className="flex-1 skeleton-shimmer rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function SkeletonConversationCard() {
  return (
    <div className="rounded-lg border border-steel-border bg-steel-dark/50 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full skeleton-shimmer" />
        <SkeletonBar width="35%" height={14} />
      </div>
      <SkeletonBar width="90%" height={12} />
      <SkeletonBar width="70%" height={12} />
      <SkeletonBar width="50%" height={10} />
    </div>
  );
}

function SkeletonBattleArea() {
  return (
    <div className="rounded-lg border border-steel-border bg-steel-dark/50 p-6 space-y-4">
      <div className="flex justify-between">
        <div className="w-24 h-24 rounded-lg skeleton-shimmer" />
        <div className="flex flex-col items-center justify-center gap-2">
          <SkeletonBar width={40} height={40} style={{ borderRadius: '50%' }} />
          <SkeletonBar width={60} height={12} />
        </div>
        <div className="w-24 h-24 rounded-lg skeleton-shimmer" />
      </div>
      <div className="h-px bg-steel-border" />
      <div className="space-y-2">
        <SkeletonBar width="100%" height={12} />
        <SkeletonBar width="85%" height={12} />
        <SkeletonBar width="60%" height={12} />
      </div>
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  );
}

function SkeletonLiveFeed() {
  return (
    <div className="space-y-4">
      <SkeletonBar width="30%" height={20} />
      <SkeletonConversationCard />
      <SkeletonConversationCard />
      <SkeletonConversationCard />
    </div>
  );
}

function SkeletonArena() {
  return (
    <div className="space-y-4">
      <SkeletonBar width="25%" height={20} />
      <SkeletonBattleArea />
    </div>
  );
}

function SkeletonGeneric() {
  return (
    <div className="space-y-4">
      <SkeletonBar width="35%" height={24} />
      <SkeletonBar width="100%" height={16} />
      <SkeletonBar width="90%" height={16} />
      <SkeletonBar width="75%" height={16} />
      <div className="h-8" />
      <SkeletonBar width="100%" height={200} />
    </div>
  );
}

function PageSkeleton({ pageId }) {
  switch (pageId) {
    case 'dashboard': return <SkeletonDashboard />;
    case 'live': return <SkeletonLiveFeed />;
    case 'arena': return <SkeletonArena />;
    default: return <SkeletonGeneric />;
  }
}

/* ──────────────────────────── Tooltip ──────────────────────────── */

function Tooltip({ children, text, show }) {
  return (
    <div className="relative group">
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
                       bg-steel-dark border border-steel-border text-neon-green text-xs
                       font-mono px-2 py-1 rounded whitespace-nowrap pointer-events-none
                       shadow-lg shadow-black/30"
          >
            {text}
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0
                            border-t-4 border-b-4 border-r-4
                            border-transparent border-r-steel-border" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ──────────────────────────── Toast Display ──────────────────────────── */

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className={`
              pointer-events-auto rounded-lg border px-4 py-3 text-sm font-mono
              shadow-lg shadow-black/30 backdrop-blur-sm cursor-pointer
              ${t.type === 'error'
                ? 'bg-red-900/80 border-red-500/40 text-red-200'
                : t.type === 'success'
                  ? 'bg-green-900/80 border-neon-green/40 text-neon-green'
                  : t.type === 'warning'
                    ? 'bg-amber-900/80 border-robot-amber/40 text-robot-amber'
                    : 'bg-steel-dark/90 border-steel-border text-retro-text'
              }
            `}
            onClick={() => onDismiss(t.id)}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ──────────────────────────── CSS-in-JS styles ──────────────────────────── */

const dynamicStyles = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .skeleton-shimmer {
    background: linear-gradient(
      90deg,
      rgba(255,255,255,0.03) 25%,
      rgba(255,255,255,0.08) 50%,
      rgba(255,255,255,0.03) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.8s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(0, 255, 136, 0.3); }
    50% { box-shadow: 0 0 12px rgba(0, 255, 136, 0.6); }
  }

  .training-pulse {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  /* Focus ring: neon green */
  *:focus-visible {
    outline: 2px solid #00ff88;
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Scroll fade indicators */
  .scroll-fade-container {
    position: relative;
  }
  .scroll-fade-container::before,
  .scroll-fade-container::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 24px;
    pointer-events: none;
    z-index: 1;
  }
  .scroll-fade-container::before {
    top: 0;
    background: linear-gradient(to bottom, var(--fade-color, #0d0d1a), transparent);
  }
  .scroll-fade-container::after {
    bottom: 0;
    background: linear-gradient(to top, var(--fade-color, #0d0d1a), transparent);
  }

  /* Card micro-interaction base */
  .card-lift {
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .card-lift:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 8px rgba(0, 255, 136, 0.08);
  }

  /* Button micro-interaction */
  .btn-glow {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .btn-glow:hover {
    transform: scale(1.05);
    box-shadow: 0 0 12px rgba(0, 255, 136, 0.3);
  }
  .btn-glow:active {
    transform: scale(0.98);
  }

  /* Sidebar nav item hover glow */
  .nav-item-glow {
    transition: transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  }
  .nav-item-glow:hover {
    transform: scale(1.02);
    background-color: rgba(0, 255, 136, 0.05);
    box-shadow: 0 0 12px rgba(0, 255, 136, 0.08);
  }

  /* Active nav left border accent */
  .nav-active-accent {
    position: relative;
  }
  .nav-active-accent::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    background: #00ff88;
    border-radius: 0 3px 3px 0;
    box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
  }
`;

/* ──────────────────────────── Page Content Map ──────────────────────────── */

function PageContent({ activePage, props }) {
  const {
    sessions, metrics, conversations, languageData, isTraining, isConnected,
    selectSession, createNewSession, startSession, stopSession, resetSession,
    activeSession,
  } = props;

  switch (activePage) {
    case 'dashboard':
      return (
        <Dashboard
          sessions={sessions}
          metrics={metrics}
          conversations={conversations}
          isTraining={isTraining}
          onSelectSession={selectSession}
          onCreateSession={createNewSession}
          onStartTraining={startSession}
        />
      );
    case 'live':
      return (
        <LiveFeed
          conversations={conversations}
          isConnected={isConnected}
          isTraining={isTraining}
        />
      );
    case 'analysis':
      return <LanguageAnalysis metrics={metrics} languageData={languageData} />;
    case 'comparison':
      return <SessionComparison />;
    case 'heatmap':
      return <MessageHeatmap />;
    case 'phylogeny':
      return <PhylogeneticTree />;
    case 'attention':
      return <AgentAttention />;
    case 'arena':
      return <CommunicationArena sessionId={activeSession?.session_id} />;
    case 'decoder':
      return <SymbolDecoder />;
    case 'playground':
      return <Playground />;
    case 'minds':
      return <AgentMinds sessionId={activeSession?.session_id} />;
    case 'editor':
      return (
        <EnvironmentEditor
          onCreateSession={createNewSession}
          onStart={startSession}
          onStop={stopSession}
          onReset={resetSession}
          activeSession={activeSession}
          isTraining={isTraining}
        />
      );
    case 'desktop':
      return <DesktopAccess />;
    case 'workspace':
      return <AgentWorkspace />;
    case 'replay':
      return <ReplaySystem />;
    case 'demo-mode':
      return <DemoMode />;
    case 'voice-controls':
      return <VoiceControls />;
    case 'training-comparison':
      return <TrainingComparison />;
    case 'language-evolution':
      return <LanguageEvolution />;
    case 'agent-specialization':
      return <AgentSpecialization />;
    case 'social-dynamics':
      return <SocialDynamics />;
    case 'memory-viz':
      return <MemoryVisualization sessionId={activeSession?.session_id} />;
    case 'translation':
      return <TranslationPanel sessionId={activeSession?.session_id} />;
    case 'narrator':
      return <TrainingNarrator sessionId={activeSession?.session_id} />;
    case 'neural-viz':
      return <NeuralVisualizer sessionId={activeSession?.session_id} />;
    case 'world-sim':
      return <WorldSimulation />;
    case 'human-feedback':
      return <HumanFeedback sessionId={activeSession?.session_id} />;
    case 'swarm':
      return <SwarmIntelligence />;
    default:
      return <SkeletonGeneric />;
  }
}

/* ──────────────────────────── Header Breadcrumb ──────────────────────────── */

function Breadcrumb({ activePage }) {
  const current = NAV_ITEMS.find((i) => i.id === activePage);
  return (
    <div className="flex items-center gap-2 text-xs font-mono text-retro-muted mb-4">
      <span className="text-neon-green/60">LANG_EMERGENCE</span>
      <span className="text-steel-border">/</span>
      <span className="text-retro-text">{current?.label || activePage}</span>
    </div>
  );
}

/* ──────────────────────────── Main App ──────────────────────────── */

function AppContent() {
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [toastList, setToastList] = useState([]);
  const skeletonTimerRef = useRef(null);
  const lastPageRef = useRef(activePage);
  const toastIdRef = useRef(0);

  const { theme, toggleTheme } = useTheme();
  const { toast: originalToast } = useToast();

  // Enhanced toast that also shows visual toasts
  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToastList((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToastList((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToastList((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    info: (msg) => { originalToast?.info?.(msg); addToast(msg, 'info'); },
    success: (msg) => { originalToast?.success?.(msg); addToast(msg, 'success'); },
    error: (msg) => { originalToast?.error?.(msg); addToast(msg, 'error'); },
    warning: (msg) => { originalToast?.warning?.(msg); addToast(msg, 'warning'); },
  };

  const {
    sessions,
    activeSession,
    metrics,
    conversations,
    languageData,
    isTraining,
    isConnected,
    error,
    loadSessions,
    selectSession,
    startSession,
    stopSession,
    createNewSession,
    resetSession,
  } = useTraining(toast);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Skeleton on page switch with minimum duration
  useEffect(() => {
    if (lastPageRef.current !== activePage) {
      setShowSkeleton(true);
      const start = Date.now();
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, SKELETON_MIN_DURATION - elapsed);
        setTimeout(() => setShowSkeleton(false), remaining);
      }, 150); // Brief skeleton flash then release
      lastPageRef.current = activePage;
    }
    return () => {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    };
  }, [activePage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      const pageMap = {
        '1': 'dashboard',
        '2': 'live',
        '3': 'analysis',
        '4': 'comparison',
        '5': 'heatmap',
        '6': 'phylogeny',
        '7': 'attention',
        '8': 'arena',
        '9': 'decoder',
        '0': 'minds',
        '-': 'desktop',
        '=': 'workspace',
        'p': 'playground',
        'e': 'editor',
        'r': 'replay',
        'd': 'demo-mode',
        'v': 'voice-controls',
        't': 'training-comparison',
        'l': 'language-evolution',
        's': 'agent-specialization',
        'g': 'social-dynamics',
        'm': 'memory-viz',
        'q': 'translation',
        'n': 'narrator',
        'i': 'neural-viz',
        'w': 'world-sim',
        'f': 'human-feedback',
        'x': 'swarm',
      };

      if (pageMap[e.key]) {
        setActivePage(pageMap[e.key]);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (activeSession) {
          if (isTraining) {
            stopSession(activeSession.session_id);
            toast.info('Training paused');
          } else {
            startSession(activeSession.session_id);
            toast.info('Training resumed');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSession, isTraining, startSession, stopSession, toast]);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const pageProps = {
    sessions, metrics, conversations, languageData, isTraining, isConnected,
    selectSession, createNewSession, startSession, stopSession, resetSession, activeSession,
  };

  return (
    <>
      {/* Inject dynamic styles */}
      <style>{dynamicStyles}</style>

      {/* Toast notifications */}
      <ToastContainer toasts={toastList} onDismiss={dismissToast} />

      <div className="flex h-screen overflow-hidden bg-retro-bg scanline-overlay crt-flicker">
        {/* Sidebar */}
        <motion.aside
          animate={{ width: sidebarCollapsed ? 64 : 240 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="flex flex-col bg-steel-dark border-r border-steel-border flex-shrink-0"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 p-4 border-b border-steel-border min-h-[64px]">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
              <div className="robot-eye" />
            </div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden"
                >
                  <h1 className="text-sm font-bold whitespace-nowrap font-mono uppercase tracking-wider neon-text">LANG_EMERGENCE</h1>
                  <p className="text-xs text-retro-muted whitespace-nowrap">Language Lab</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto scroll-fade-container" style={{ '--fade-color': '#141428', position: 'relative', zIndex: 50 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.id;
              const NavButton = (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                    nav-item-glow relative
                    ${isActive
                      ? 'text-neon-green bg-neon-green/5 nav-active-accent'
                      : 'text-retro-muted hover:text-neon-green'
                    }
                  `}
                >
                  <item.icon
                    size={18}
                    className={`flex-shrink-0 transition-colors duration-200 ${
                      isActive ? 'text-neon-green' : 'text-retro-muted group-hover:text-neon-green'
                    }`}
                  />
                  {isActive && !sidebarCollapsed && <span className="led-dot ml-[-4px]" />}
                  <AnimatePresence>
                    {!sidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* Keyboard shortcut hint */}
                  {!sidebarCollapsed && item.shortcut && (
                    <span className="ml-auto text-retro-muted/50 text-xs font-mono">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              );

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.id} text={item.label} show={sidebarCollapsed}>
                    {NavButton}
                  </Tooltip>
                );
              }
              return NavButton;
            })}
          </nav>

          {/* Theme Toggle & Status */}
          <div className="p-3 border-t border-steel-border space-y-2">
            {/* Connection Status */}
            <div className={`flex items-center gap-2 text-xs font-mono ${isConnected ? 'text-retro-text' : 'text-retro-muted'}`}>
              <span className={isConnected ? 'led-dot' : 'led-dot-red'} />
              {!sidebarCollapsed && <span>{isConnected ? 'Backend Connected' : 'Backend Disconnected'}</span>}
            </div>

            {/* Training Status Badge */}
            {!sidebarCollapsed && isTraining && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <span className="w-2 h-2 rounded-full bg-neon-green training-pulse" />
                <span className="text-neon-green">Training Active</span>
              </motion.div>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs
                         font-mono text-retro-muted hover:text-neon-green
                         border border-steel-border hover:border-neon-green/30
                         transition-colors btn-glow"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {!sidebarCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
            </button>
          </div>

          {/* Collapse Toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 text-retro-muted hover:text-neon-green border-t border-steel-border transition-colors btn-glow"
          >
            {sidebarCollapsed ? <ChevronRight size={16} className="mx-auto" /> : <ChevronLeft size={16} className="mx-auto" />}
          </button>
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto scroll-fade-container" style={{ '--fade-color': '#0a0a1a' }}>
          <div className="max-w-7xl mx-auto p-4 md:p-6">
            {/* Header: Breadcrumb + Status */}
            <div className="flex items-center justify-between mb-2">
              <Breadcrumb activePage={activePage} />
              <div className="flex items-center gap-3 text-xs font-mono text-retro-muted">
                {/* Connection indicator */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 shadow-green-400/50 shadow-sm' : 'bg-red-400'}`} />
                  <span className="hidden sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
                </div>

                {/* Training badge */}
                {isTraining && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-neon-green/30 bg-neon-green/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-neon-green training-pulse" />
                    <span className="text-neon-green hidden sm:inline">Training</span>
                  </div>
                )}

                {/* Keyboard shortcut hints */}
                <span className="hidden md:inline text-retro-muted/40">
                  1-9 nav · e/r/p/d/v/t/l/s/g quick · Space pause
                </span>
              </div>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-4 bg-robot-amber/5 border border-robot-amber/30 text-robot-amber px-4 py-2 rounded-lg text-sm"
                >
                  {error} — Using demo data
                </motion.div>
              )}
            </AnimatePresence>

            {/* Page Content with Transitions */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={pageTransitions[DEFAULT_TRANSITION].initial}
                animate={pageTransitions[DEFAULT_TRANSITION].animate}
                exit={pageTransitions[DEFAULT_TRANSITION].exit}
                transition={{
                  duration: showSkeleton ? 0 : PAGE_ENTER_DURATION,
                  ease: 'easeOut',
                }}
              >
                {showSkeleton ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PageSkeleton pageId={activePage} />
                  </motion.div>
                ) : (
                  <ErrorBoundary key={activePage}>
                  <Suspense fallback={<LoadingScreen />}>
                    <PageContent activePage={activePage} props={pageProps} />
                  </Suspense>
                </ErrorBoundary>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
