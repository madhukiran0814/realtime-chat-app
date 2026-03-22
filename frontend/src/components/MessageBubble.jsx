import { useCallback } from 'react';
import TickMark from './TickMark';
import { formatTime } from '../utils/api';

export default function MessageBubble({ msg, isSent, onContextMenu, onScrollToReply }) {
  const senderName = msg.sender?.username || msg.senderId;

  const handleContext = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, msg);
  }, [msg, onContextMenu]);

  const handleReplyClick = useCallback(() => {
    if (msg.replyTo?.id) onScrollToReply(msg.replyTo.id);
  }, [msg.replyTo, onScrollToReply]);

  // Determine status for sent messages
  let status = msg.status;
  if (isSent && !status) {
    if (msg.reads?.length > 0) status = 'seen';
    else status = 'sent';
  }

  return (
    <div className={`message-row ${isSent ? 'sent' : 'received'}`} data-msg-id={msg.id}>
      <div className="message-bubble" onContextMenu={handleContext}>
        {!isSent && <div className="sender-name">{senderName}</div>}
        {msg.replyTo && (
          <div className="reply-preview reply-clickable" onClick={handleReplyClick}>
            {msg.replyTo.sender?.username}: {msg.replyTo.content?.substring(0, 60)}
          </div>
        )}
        <div className="msg-content">{msg.content}</div>
        <div className="msg-meta">
          <span>{formatTime(msg.createdAt)}</span>
          {isSent && <TickMark status={status} />}
        </div>
      </div>
    </div>
  );
}
