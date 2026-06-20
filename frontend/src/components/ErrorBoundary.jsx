import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Page crash:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '24px',
          background: '#1a1a2e',
          color: '#ff6b6b',
          fontFamily: 'JetBrains Mono, monospace',
          borderRadius: '8px',
          margin: '16px',
          border: '1px solid #ff6b6b33'
        }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: '12px' }}>⚠ PAGE ERROR</h2>
          <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '8px' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              background: '#ff6b6b33',
              color: '#ff6b6b',
              border: '1px solid #ff6b6b',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
