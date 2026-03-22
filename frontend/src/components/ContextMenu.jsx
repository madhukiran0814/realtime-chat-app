import { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, onReply, onCopy, onClose }) {
  const ref = useRef();

  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const posX = Math.min(x, window.innerWidth - 170);
  const posY = Math.min(y, window.innerHeight - 90);

  return (
    <div className="context-menu" ref={ref} style={{ left: posX, top: posY }}>
      <button onClick={onReply}>↩ Reply</button>
      <button onClick={onCopy}>📋 Copy</button>
    </div>
  );
}
