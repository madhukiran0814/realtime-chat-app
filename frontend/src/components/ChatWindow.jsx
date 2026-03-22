import { useEffect, useRef, useState, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import ContextMenu from './ContextMenu';
import { getChatDisplayName, getOtherMember, formatLastSeen, formatDateSeparator } from '../utils/api';

export default function ChatWindow({
  chat, messages, userId, hasMore, isLoading,
  typingUsers, onSend, onTyping, onLoadOlder, onMarkRead,
}) {
  const containerRef = useRef();
  const bottomRef = useRef();
  const [contextMenu, setContextMenu] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const isInitialLoad = useRef(true);
  const prevScrollHeight = useRef(0);

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (isInitialLoad.current && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      isInitialLoad.current = false;
    }
  }, [messages]);

  // When chat changes, reset
  useEffect(() => {
    isInitialLoad.current = true;
    setReplyingTo(null);
    setContextMenu(null);
  }, [chat?.id]);

  // Maintain scroll position after loading older messages
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (prevScrollHeight.current > 0 && el.scrollHeight > prevScrollHeight.current) {
      el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [messages]);

  // Auto-scroll to bottom when new message arrives (if near bottom)
  const lastMsg = messages[messages.length - 1];
  const lastMsgId = useRef(null);
  useEffect(() => {
    if (!lastMsg || lastMsg.id === lastMsgId.current) return;
    lastMsgId.current = lastMsg.id;
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom || lastMsg.senderId === userId) {
      setTimeout(() => { el.scrollTop = el.scrollHeight; }, 10);
    }
  }, [lastMsg, userId]);

  // Scroll listener for loading older messages
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !hasMore || isLoading) return;
    if (el.scrollTop < 60) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadOlder();
    }
  }, [hasMore, isLoading, onLoadOlder]);

  // Mark messages as read
  useEffect(() => {
    if (!messages.length) return;
    const lastReceived = [...messages].reverse().find((m) => m.senderId !== userId);
    if (lastReceived) onMarkRead(lastReceived.id);
  }, [messages, userId, onMarkRead]);

  // Scroll to a replied message
  const handleScrollToReply = useCallback((msgId) => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-msg-id="${msgId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight
      const bubble = target.querySelector('.message-bubble');
      if (bubble) {
        bubble.classList.add('highlight');
        setTimeout(() => bubble.classList.remove('highlight'), 1500);
      }
    }
  }, []);

  // Context menu
  const handleContextMenu = useCallback((e, msg) => {
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, []);

  const handleReply = () => {
    if (!contextMenu) return;
    const { msg } = contextMenu;
    setReplyingTo({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender?.username || msg.senderId,
      content: msg.content?.substring(0, 100),
    });
    setContextMenu(null);
  };

  const handleCopy = () => {
    if (contextMenu?.msg?.content) navigator.clipboard.writeText(contextMenu.msg.content).catch(() => {});
    setContextMenu(null);
  };

  const handleSend = (content) => {
    onSend(content, replyingTo);
    setReplyingTo(null);
  };

  // Chat info
  const name = getChatDisplayName(chat, userId);
  const other = getOtherMember(chat, userId);
  const initials = name.substring(0, 2).toUpperCase();

  let statusText = '';
  let statusClass = '';
  if (chat.type === 'DIRECT' && other) {
    if (other.user?.isOnline) {
      statusText = 'Online';
      statusClass = 'online';
    } else if (other.user?.lastSeen) {
      statusText = 'Last seen ' + formatLastSeen(other.user.lastSeen);
    } else {
      statusText = 'Offline';
    }
  } else {
    const online = chat.members?.filter((m) => m.userId !== userId && m.user?.isOnline).length || 0;
    statusText = `${chat.members?.length || 0} members, ${online} online`;
  }

  // Typing users for this chat
  const typingList = Object.keys(typingUsers)
    .filter((k) => k.startsWith(chat.id + ':'))
    .map((k) => {
      const uid = k.split(':')[1];
      const member = chat.members?.find((m) => m.userId === uid);
      return member?.user?.username || 'Someone';
    });

  // Group messages by date for separators
  const renderMessages = () => {
    const elements = [];
    let lastDate = '';

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        elements.push(
          <div className="date-separator" key={`date-${msgDate}`}>
            <span>{formatDateSeparator(msg.createdAt)}</span>
          </div>
        );
      }
      elements.push(
        <MessageBubble
          key={msg.id}
          msg={msg}
          isSent={msg.senderId === userId}
          onContextMenu={handleContextMenu}
          onScrollToReply={handleScrollToReply}
        />
      );
    }
    return elements;
  };

  return (
    <div className="chat-area">
      {/* Header */}
      <div className="chat-header">
        <div className="header-avatar">{initials}</div>
        <div className="chat-header-info">
          <div className="name">{name}</div>
          <div className={`status ${statusClass}`}>{statusText}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {hasMore && (
          <div className="load-more-bar" onClick={() => { prevScrollHeight.current = containerRef.current?.scrollHeight || 0; onLoadOlder(); }}>
            {isLoading ? 'Loading...' : 'Load older messages'}
          </div>
        )}
        {renderMessages()}
        <div ref={bottomRef} />
      </div>

      {/* Typing */}
      <div className="typing-bar">
        {typingList.length > 0 && (
          <span>{typingList.join(', ')} {typingList.length === 1 ? 'is' : 'are'} typing...</span>
        )}
      </div>

      {/* Input */}
      <InputBar
        onSend={handleSend}
        onTyping={onTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onReply={handleReply}
          onCopy={handleCopy}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
