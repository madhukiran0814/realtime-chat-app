import { useState, useRef, useCallback } from 'react';
import EmojiPicker from './EmojiPicker';

export default function InputBar({ onSend, onTyping, replyingTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef();
  const typingRef = useRef(null);

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content) return;
    onSend(content);
    setText('');
    setShowEmoji(false);
  }, [text, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    onTyping(true);
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const start = input.selectionStart;
    const newText = text.substring(0, start) + emoji + text.substring(input.selectionEnd);
    setText(newText);
    setShowEmoji(false);
    setTimeout(() => {
      input.focus();
      input.selectionStart = input.selectionEnd = start + emoji.length;
    }, 0);
  };

  return (
    <>
      {replyingTo && (
        <div className="reply-bar">
          <div className="reply-content">
            <div className="reply-author">
              {replyingTo.senderName}
            </div>
            <div className="reply-text">{replyingTo.content}</div>
          </div>
          <button className="close-reply" onClick={onCancelReply}>&times;</button>
        </div>
      )}
      <div className="input-area">
        <div className="emoji-picker-wrapper">
          <button className="emoji-toggle" onClick={() => setShowEmoji((s) => !s)}>
            😊
          </button>
          {showEmoji && (
            <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <button className="send-btn" onClick={handleSend} disabled={!text.trim()} title="Send">
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/></svg>
        </button>
      </div>
    </>
  );
}
