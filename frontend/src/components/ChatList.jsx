import { getChatDisplayName, getOtherMember, formatTime } from '../utils/api';

export default function ChatList({ chats, currentChatId, userId, onSelect, onNewChat }) {
  const sorted = Object.values(chats).sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || a.updatedAt || a.createdAt;
    const bTime = b.lastMessage?.createdAt || b.updatedAt || b.createdAt;
    return new Date(bTime) - new Date(aTime);
  });

  return (
    <>
      <div className="chat-list">
        {sorted.map((chat) => {
          const name = getChatDisplayName(chat, userId);
          const other = getOtherMember(chat, userId);
          const initials = name.substring(0, 2).toUpperCase();
          const preview = chat.lastMessage?.content || 'No messages yet';
          const time = chat.lastMessage?.createdAt;
          const isActive = chat.id === currentChatId;

          return (
            <div
              key={chat.id}
              className={`chat-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(chat.id)}
            >
              <div className="chat-avatar">
                {initials}
                {chat.type === 'DIRECT' && other?.user?.isOnline && (
                  <span style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 10, height: 10, background: '#22c55e',
                    borderRadius: '50%', border: '2px solid var(--bg-secondary)',
                  }} />
                )}
              </div>
              <div className="chat-info">
                <div className="chat-name">{name}</div>
                <div className="chat-preview">{preview}</div>
              </div>
              <div className="chat-meta">
                {time && <div className="chat-time">{formatTime(time)}</div>}
                {(chat.unreadCount || 0) > 0 && (
                  <span className="unread-badge">{chat.unreadCount}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="new-chat-btn" onClick={onNewChat}>+ New Chat</button>
    </>
  );
}
