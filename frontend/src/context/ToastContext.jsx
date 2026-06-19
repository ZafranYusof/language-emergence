import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext();

const ICON_MAP = {
  success: { Icon: CheckCircle, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/30', bar: 'bg-neon-green', led: 'bg-neon-green' },
  error: { Icon: XCircle, color: 'text-retro-error', bg: 'bg-retro-error/10', border: 'border-retro-error/30', bar: 'bg-retro-error', led: 'bg-retro-error' },
  warning: { Icon: AlertTriangle, color: 'text-robot-amber', bg: 'bg-robot-amber/10', border: 'border-robot-amber/30', bar: 'bg-robot-amber', led: 'bg-robot-amber' },
  info: { Icon: Info, color: 'text-cyber-cyan', bg: 'bg-cyber-cyan/10', border: 'border-cyber-cyan/30', bar: 'bg-cyber-cyan', led: 'bg-cyber-cyan' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type, duration, startTime: Date.now() }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 5000),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }) {
  const { id, message, type, duration, startTime } = toast;
  const style = ICON_MAP[type] || ICON_MAP.info;
  const { Icon } = style;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onRemove(id);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [id, startTime, duration, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`pointer-events-auto relative overflow-hidden border ${style.border} ${style.bg} shadow-xl`}
      style={{ borderRadius: '2px' }}
    >
      <div className="flex items-start gap-3 p-3">
        <div className={`w-2 h-2 mt-1.5 flex-shrink-0 rounded-full ${style.led}`} style={{ boxShadow: `0 0 6px 1px currentColor` }} />
        <Icon size={16} className={`${style.color} flex-shrink-0 mt-0.5`} />
        <p className="text-sm text-retro-text flex-1 font-mono">{message}</p>
        <button
          onClick={() => onRemove(id)}
          className="text-retro-muted hover:text-retro-text transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-0.5 bg-steel-dark">
        <div
          className={`h-full ${style.bar} transition-all duration-100 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
