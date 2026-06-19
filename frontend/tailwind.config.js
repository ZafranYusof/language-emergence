/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-green': '#00ff88',
        'robot-amber': '#ffaa00',
        'cyber-cyan': '#00ddff',
        'steel-dark': '#1a1a2e',
        'steel-border': '#2d2d44',
        'retro-bg': '#0a0a0a',
        'retro-text': '#e0e0e0',
        'retro-muted': '#666680',
        'retro-error': '#ff3333',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'Consolas', 'monospace'],
        heading: ['Courier New', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 12px 2px rgba(0, 255, 136, 0.3)',
        'glow-amber': '0 0 12px 2px rgba(255, 170, 0, 0.3)',
        'glow-cyan': '0 0 12px 2px rgba(0, 221, 255, 0.3)',
        'glow-green-intense': '0 0 20px 4px rgba(0, 255, 136, 0.4)',
        'glow-amber-intense': '0 0 20px 4px rgba(255, 170, 0, 0.4)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 1s step-end infinite',
        'robot-eye': 'robot-eye 2s ease-in-out infinite',
        'crt-flicker': 'crt-flicker 3s ease-in-out infinite',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 255, 136, 0.4)' },
          '50%': { boxShadow: '0 0 16px 4px rgba(0, 255, 136, 0.2)' },
        },
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'robot-eye': {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(255, 170, 0, 0.3)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 0 20px 6px rgba(255, 170, 0, 0.6)', transform: 'scale(1.1)' },
        },
        'crt-flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.98' },
        },
        'neon-pulse': {
          '0%, 100%': { textShadow: '0 0 4px rgba(0, 255, 136, 0.5)' },
          '50%': { textShadow: '0 0 12px rgba(0, 255, 136, 0.8), 0 0 24px rgba(0, 255, 136, 0.4)' },
        },
      },
    },
  },
  plugins: [],
}
