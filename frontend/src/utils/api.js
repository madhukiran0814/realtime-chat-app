const API_URL = import.meta.env.VITE_API_URL || '';

export async function apiFetch(path, token, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatLastSeen(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const mins = Math.floor((now - date) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function formatDateSeparator(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function getChatDisplayName(chat, currentUserId) {
  if (chat.type === 'DIRECT') {
    const other = chat.members?.find((m) => m.userId !== currentUserId);
    return other?.user?.username || 'Chat';
  }
  return chat.name || 'Group';
}

export function getOtherMember(chat, currentUserId) {
  return chat.members?.find((m) => m.userId !== currentUserId);
}

export const EMOJIS = {
  Smileys: ['😊','😂','🤣','😍','🥰','😘','😎','🤩','😇','🙂','😉','😋','🤗','🤔','🤫','🤭','😏','😌','😴','🥳','😜','😝','🤪','😤','😭','😱','🥺','😳'],
  Gestures: ['👍','👎','👋','🤝','🙏','💪','👏','🤞','✌️','🤙','👊','✊','🫡','🫶','❤️','🔥','⭐','💯','✅','❌'],
  Objects: ['💬','📎','📷','🎉','🎊','🎁','📌','💡','🔔','⏰','📝','📁','🗑️','🔒','🔑','⚙️'],
};
