import { useEffect, useState } from 'react';

export default function PageTransition({ children, pageKey }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [pageKey]);
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
    }}>
      {children}
    </div>
  );
}
