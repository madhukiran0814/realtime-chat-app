import { useEffect, useCallback, useRef, useState } from 'react';
import { useUser, useAuth, SignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { useChat } from './hooks/useChat';
import { useWebSocket } from './hooks/useWebSocket';
import { apiFetch } from './utils/api';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="auth-screen">
          <h1>Chat App</h1>
          <p>Sign in to start chatting</p>
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <ChatApp />
      </SignedIn>
    </>
  );
}

function ChatApp() {
  const { user } = useUser();
  const { getToken, signOut } = useAuth();
  const tokenRef = useRef('');
  const [wsToken, setWsToken] = useState('');

  // Stable token getter that always returns a fresh token
  const getTokenStable = useCallback(async () => {
    const t = await getToken();
    if (t) tokenRef.current = t;
    return t;
  }, [getToken]);

  const chat = useChat(getTokenStable);
  const {
    chats, messagesByChat, currentChatId, typingUsers,
    fetchChats, fetchMessages, selectChat, addMessage, updateMessageStatus,
    handleAck, incrementUnread, clearUnread, updatePresence, setTyping,
    hasMore, isLoading,
  } = chat;

  const currentChatIdRef = useRef(currentChatId);
  currentChatIdRef.current = currentChatId;
  const sendRef = useRef(null);

  // Handle WS messages
  const handleWSMessage = useCallback((msg) => {
    const wsSend = sendRef.current;
    switch (msg.type) {
      case 'connected':
        break;
      case 'message:new':
        addMessage(msg.payload);
        if (msg.payload.senderId !== user.id && wsSend) {
          if (msg.payload.chatId === currentChatIdRef.current) {
            wsSend('message:read', { chatId: msg.payload.chatId, messageId: msg.payload.id });
          } else {
            wsSend('message:confirm_delivery', { chatId: msg.payload.chatId, messageId: msg.payload.id });
            incrementUnread(msg.payload.chatId);
          }
        }
        break;
      case 'message:ack':
        handleAck(msg.payload);
        break;
      case 'message:delivered':
        updateMessageStatus(msg.payload.chatId, msg.payload.messageId, 'delivered');
        break;
      case 'message:seen':
        updateMessageStatus(msg.payload.chatId, msg.payload.messageId, 'seen');
        break;
      case 'message:typing_indicator':
        setTyping(msg.payload.chatId, msg.payload.userId, msg.payload.isTyping);
        break;
      case 'presence:update':
        updatePresence(msg.payload);
        break;
      case 'sync:messages':
        msg.payload.messages?.forEach((m) => {
          addMessage(m);
          if (m.senderId !== user.id && wsSend) {
            if (m.chatId === currentChatIdRef.current) {
              wsSend('message:read', { chatId: m.chatId, messageId: m.id });
            } else {
              wsSend('message:confirm_delivery', { chatId: m.chatId, messageId: m.id });
            }
          }
        });
        break;
      default:
        break;
    }
  }, [addMessage, handleAck, updateMessageStatus, incrementUnread, setTyping, updatePresence, user]);

  const { connected, send } = useWebSocket(wsToken, handleWSMessage);
  sendRef.current = send;

  // Init: get token, sync user, fetch chats
  useEffect(() => {
    let mounted = true;
    (async () => {
      const t = await getToken();
      if (!t || !mounted) return;
      tokenRef.current = t;
      setWsToken(t);

      // Sync user
      await apiFetch('/api/users/sync', t, {
        method: 'POST',
        body: JSON.stringify({
          username: user.username || user.firstName || user.id,
          email: user.primaryEmailAddress?.emailAddress || '',
          avatarUrl: user.imageUrl,
        }),
      }).catch(() => {});

      await fetchChats();

      // Confirm delivery for all undelivered messages across all chats
      // (handles the case where B was offline and A sent messages)
      setTimeout(() => {
        const wsSend = sendRef.current;
        if (wsSend) {
          wsSend('message:deliver_all', {});
        }
      }, 1000);
    })();

    // Refresh token periodically
    const interval = setInterval(async () => {
      const t = await getToken();
      if (t) tokenRef.current = t;
    }, 50000);

    return () => { mounted = false; clearInterval(interval); };
  }, [getToken, user, fetchChats]);

  // Fetch messages when chat changes — send delivery/read confirmations for loaded messages
  useEffect(() => {
    if (!currentChatId) return;
    (async () => {
      const data = await fetchMessages(currentChatId);
      clearUnread(currentChatId);
      // Send read receipts for all messages from others (chat is open)
      if (data?.messages) {
        const wsSend = sendRef.current;
        if (!wsSend) return;
        const unreadFromOthers = data.messages.filter((m) => m.senderId !== user.id);
        const lastMsg = unreadFromOthers[unreadFromOthers.length - 1];
        if (lastMsg) {
          wsSend('message:read', { chatId: currentChatId, messageId: lastMsg.id });
        }
      }
    })();
  }, [currentChatId, fetchMessages, clearUnread, user]);

  // Send message
  const handleSend = useCallback((content, replyingTo) => {
    if (!currentChatId) return;
    const clientMessageId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const payload = { chatId: currentChatId, content, clientMessageId };
    if (replyingTo) payload.replyToId = replyingTo.id;

    send('message:send', payload);

    const optimistic = {
      id: clientMessageId,
      chatId: currentChatId,
      senderId: user.id,
      content,
      status: 'sending',
      createdAt: new Date().toISOString(),
      sender: { id: user.id, username: user.username || user.firstName },
    };
    if (replyingTo) {
      optimistic.replyTo = {
        id: replyingTo.id,
        content: replyingTo.content,
        sender: { username: replyingTo.senderName },
      };
    }
    addMessage(optimistic);
    send('message:typing', { chatId: currentChatId, isTyping: false });
  }, [currentChatId, send, addMessage, user]);

  // Typing
  const handleTyping = useCallback((isTyping) => {
    if (currentChatId) send('message:typing', { chatId: currentChatId, isTyping });
  }, [currentChatId, send]);

  // Mark read
  const handleMarkRead = useCallback((messageId) => {
    if (currentChatId) {
      send('message:read', { chatId: currentChatId, messageId });
      clearUnread(currentChatId);
    }
  }, [currentChatId, send, clearUnread]);

  // Load older
  const handleLoadOlder = useCallback(() => {
    if (currentChatId) fetchMessages(currentChatId, true);
  }, [currentChatId, fetchMessages]);

  // New chat
  const handleNewChat = async () => {
    const targetId = prompt('Enter user ID to chat with:');
    if (!targetId) return;
    try {
      const newChat = await apiFetch('/api/chats', tokenRef.current, {
        method: 'POST',
        body: JSON.stringify({ type: 'DIRECT', memberIds: [targetId] }),
      });
      if (newChat.id) {
        fetchChats();
        selectChat(newChat.id);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const currentChat = currentChatId ? chats[currentChatId] : null;
  const currentMessages = currentChatId ? (messagesByChat[currentChatId] || []) : [];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Chats</h2>
          <div className="user-section">
            <span style={{ fontSize: 12, color: connected ? '#22c55e' : '#ef4444' }}>
              {connected ? '● Connected' : '● Offline'}
            </span>
            {user.imageUrl && <img className="avatar" src={user.imageUrl} alt="" />}
            <button className="sign-out-btn" onClick={() => signOut()}>Sign Out</button>
          </div>
        </div>
        <ChatList
          chats={chats}
          currentChatId={currentChatId}
          userId={user.id}
          onSelect={selectChat}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main area */}
      {currentChat ? (
        <ChatWindow
          chat={currentChat}
          messages={currentMessages}
          userId={user.id}
          hasMore={hasMore(currentChatId)}
          isLoading={isLoading(currentChatId)}
          typingUsers={typingUsers}
          onSend={handleSend}
          onTyping={handleTyping}
          onLoadOlder={handleLoadOlder}
          onMarkRead={handleMarkRead}
        />
      ) : (
        <div className="chat-area">
          <div className="chat-area-empty">
            <div className="icon">💬</div>
            <div>Select a chat or start a new conversation</div>
          </div>
        </div>
      )}
    </div>
  );
}
