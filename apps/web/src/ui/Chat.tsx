import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, MemberInfo } from '../../../server/src/protocol.ts';
import { useTheme } from '../theme/themes.tsx';

const MAX = 300;

export function Chat({
  messages,
  you,
  members,
  onSend,
}: {
  messages: ChatMessage[];
  you: string | null;
  members: MemberInfo[];
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const theme = useTheme();
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const colorOf = (id: string | null) => {
    const seat = members.find((m) => m.id === id)?.seat;
    return seat === null || seat === undefined ? undefined : theme.players[seat]?.color;
  };

  return (
    <section className="chat" aria-label="Chat">
      <ol className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <li className="muted">No messages yet. Say hi!</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.from === null ? 'system' : m.from === you ? 'mine' : ''}>
            {m.from !== null && (
              <strong style={{ color: colorOf(m.from) }}>
                {m.from === you ? 'You' : m.name}:{' '}
              </strong>
            )}
            {m.text}
          </li>
        ))}
      </ol>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text);
          setText('');
        }}
      >
        <input
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the table"
          aria-label="Chat message"
        />
        <button type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
