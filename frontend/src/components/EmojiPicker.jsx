import { useEffect, useRef } from 'react';
import { EMOJIS } from '../utils/api';

export default function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="emoji-picker" ref={ref}>
      {Object.entries(EMOJIS).map(([cat, emojis]) => (
        <div key={cat}>
          <div className="emoji-category">{cat}</div>
          <div className="emoji-grid">
            {emojis.map((e) => (
              <span key={e} onClick={() => onSelect(e)}>{e}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
