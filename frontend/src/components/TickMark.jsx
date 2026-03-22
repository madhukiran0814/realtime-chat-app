export default function TickMark({ status }) {
  if (status === 'seen') {
    return (
      <span className="tick seen" title="Seen">
        <svg viewBox="0 0 16 11"><path fill="currentColor" d="M11.07.66L5.64 6.08 3.72 4.15 2.3 5.56l3.34 3.35 6.85-6.84z"/><path fill="currentColor" d="M14.07.66L8.64 6.08 7.78 5.22 6.36 6.64l2.28 2.27 6.85-6.84z"/></svg>
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span className="tick delivered" title="Delivered">
        <svg viewBox="0 0 16 11"><path fill="currentColor" d="M11.07.66L5.64 6.08 3.72 4.15 2.3 5.56l3.34 3.35 6.85-6.84z"/><path fill="currentColor" d="M14.07.66L8.64 6.08 7.78 5.22 6.36 6.64l2.28 2.27 6.85-6.84z"/></svg>
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span className="tick sent" title="Sent">
        <svg viewBox="0 0 16 11"><path fill="currentColor" d="M11.07.66L5.64 6.08 3.72 4.15 2.3 5.56l3.34 3.35 6.85-6.84z"/></svg>
      </span>
    );
  }
  // sending
  return (
    <span className="tick sending" title="Sending">
      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/><path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M8 5v3.5l2.5 1.5"/></svg>
    </span>
  );
}
