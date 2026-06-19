import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme] = useState('dark');

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', '#0a0a0a');
    root.style.setProperty('--bg-secondary', '#1a1a2e');
    root.style.setProperty('--bg-tertiary', '#2d2d44');
    root.style.setProperty('--text-primary', '#e0e0e0');
    root.style.setProperty('--text-secondary', '#666680');
    root.style.setProperty('--border-color', '#2d2d44');
    root.classList.remove('light');
    root.classList.add('dark');
  }, []);

  const toggleTheme = useCallback(() => {
    // Retro is always dark - no-op
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
