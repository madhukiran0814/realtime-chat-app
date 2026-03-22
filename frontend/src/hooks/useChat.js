import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/api';

const PAGE_SIZE = 30;

export function useChat(getTokenFn) {
  const [chats, setChats] = useState({});
  const [messagesByChat, setMessagesByChat] = useState({});
  const [currentChatId, setCurrentChatId] = useState(null);
  const cursors = useRef({});
  const [typingUsers, setTypingUsers] = useState({});

  const fetchChats = useCallback(async () => {
    const token = await getTokenFn();
    if (!token) return;
    const data = await apiFetch('/api/chats', token);
    if (Array.isArray(data)) {
      const map = {};
      data.forEach((c) => (map[c.id] = c));
      setChats(map);
    }
  }, [getTokenFn]);

  const fetchMessages = useCallback(async (chatId, loadOlder = false) => {
    const token = await getTokenFn();
    if (!token) return;
    if (!cursors.current[chatId]) {
      cursors.current[chatId] = { nextCursor: null, hasMore: true, loading: false };
    }
    const cur = cursors.current[chatId];
    if (loadOlder && (!cur.hasMore || cur.loading)) return;
    cur.loading = true;

    const cursor = loadOlder ? cur.nextCursor : null;
    const url = `/api/chats/${chatId}/messages?limit=${PAGE_SIZE}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
    const data = await apiFetch(url, token);
    cur.loading = false;

    if (data.messages) {
      cur.nextCursor = data.nextCursor;
      cur.hasMore = data.hasMore;

      // Compute tick status from API data
      const processed = data.messages.map((m) => {
        if (!m.status || m.status === 'sending') return m;
        let status;
        if (m.reads && m.reads.length > 0) {
          status = 'seen';
        } else if (m.status === 'DELIVERED') {
          status = 'delivered';
        } else if (m.status === 'SEEN') {
          status = 'seen';
        } else {
          status = 'sent';
        }
        return { ...m, status };
      });

      setMessagesByChat((prev) => {
        const existing = prev[chatId] || [];
        if (loadOlder) {
          return { ...prev, [chatId]: [...processed, ...existing] };
        }
        return { ...prev, [chatId]: processed };
      });
    }
    return data;
  }, [getTokenFn]);

  const selectChat = useCallback((chatId) => {
    cursors.current[chatId] = { nextCursor: null, hasMore: true, loading: false };
    setMessagesByChat((prev) => ({ ...prev, [chatId]: [] }));
    setCurrentChatId(chatId);
  }, []);

  const addMessage = useCallback((msg) => {
    setMessagesByChat((prev) => {
      const chatMsgs = prev[msg.chatId] || [];
      if (chatMsgs.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [msg.chatId]: [...chatMsgs, msg] };
    });
    setChats((prev) => {
      if (!prev[msg.chatId]) return prev;
      return { ...prev, [msg.chatId]: { ...prev[msg.chatId], lastMessage: msg } };
    });
  }, []);

  const updateMessageStatus = useCallback((chatId, messageId, status) => {
    setMessagesByChat((prev) => {
      const msgs = prev[chatId];
      if (!msgs) return prev;
      return { ...prev, [chatId]: msgs.map((m) => (m.id === messageId ? { ...m, status } : m)) };
    });
  }, []);

  const handleAck = useCallback((payload) => {
    setMessagesByChat((prev) => {
      for (const [chatId, msgs] of Object.entries(prev)) {
        const idx = msgs.findIndex((m) => m.id === payload.clientMessageId);
        if (idx !== -1) {
          const updated = [...msgs];
          updated[idx] = { ...updated[idx], id: payload.messageId, createdAt: payload.createdAt, status: 'sent' };
          return { ...prev, [chatId]: updated };
        }
      }
      return prev;
    });
  }, []);

  const incrementUnread = useCallback((chatId) => {
    setChats((prev) => {
      if (!prev[chatId]) return prev;
      return { ...prev, [chatId]: { ...prev[chatId], unreadCount: (prev[chatId].unreadCount || 0) + 1 } };
    });
  }, []);

  const clearUnread = useCallback((chatId) => {
    setChats((prev) => {
      if (!prev[chatId]) return prev;
      return { ...prev, [chatId]: { ...prev[chatId], unreadCount: 0 } };
    });
  }, []);

  const updatePresence = useCallback((payload) => {
    setChats((prev) => {
      const updated = { ...prev };
      for (const [id, chat] of Object.entries(updated)) {
        const member = chat.members?.find((m) => m.userId === payload.userId);
        if (member) {
          member.user = { ...member.user, isOnline: payload.isOnline, lastSeen: payload.lastSeen };
          updated[id] = { ...chat };
        }
      }
      return updated;
    });
  }, []);

  const setTyping = useCallback((chatId, tUserId, isTyping) => {
    const key = `${chatId}:${tUserId}`;
    setTypingUsers((prev) => {
      if (isTyping) return { ...prev, [key]: true };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const hasMore = (chatId) => cursors.current[chatId]?.hasMore ?? false;
  const isLoading = (chatId) => cursors.current[chatId]?.loading ?? false;

  return {
    chats, setChats, messagesByChat, currentChatId, typingUsers,
    fetchChats, fetchMessages, selectChat, addMessage, updateMessageStatus,
    handleAck, incrementUnread, clearUnread, updatePresence, setTyping,
    hasMore, isLoading, setCurrentChatId,
  };
}
