import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { sfx } from '../../lib/sfx';
import { toastError } from './Overlays';

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z" fill="currentColor" />
    <circle cx="8.5" cy="9.5" r="1.3" fill="#653FD3" /><circle cx="12" cy="9.5" r="1.3" fill="#653FD3" /><circle cx="15.5" cy="9.5" r="1.3" fill="#653FD3" />
  </svg>
);

const timeOf = (ts) => {
  try {
    return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Chat plegable de la mesa, con burbuja de no leídos
export const ChatPanel = memo(function ChatPanel({ me, open, onToggle }) {
  const chat = useStore((s) => s.chat);
  const [seen, setSeen] = useState(chat.length);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef(null);
  const input = useRef(null);
  const lastLen = useRef(chat.length);

  // Al abrir (o si llega algo con el panel abierto) todo queda leído
  useEffect(() => { if (open) setSeen(chat.length); }, [open, chat.length]);
  useEffect(() => {
    if (open) {
      list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
      setTimeout(() => input.current?.focus(), 120);
    }
  }, [open, chat.length]);
  // Sonidito cuando llega un mensaje de otro
  useEffect(() => {
    if (chat.length > lastLen.current) {
      const msg = chat[chat.length - 1];
      if (msg && !msg.system && msg.from?.id !== me) sfx.message();
    }
    lastLen.current = chat.length;
  }, [chat, me]);

  const unread = Math.max(0, chat.length - seen);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await useStore.getState().sendChat(t.slice(0, 200));
      setText('');
    } catch (err) {
      toastError(err?.message || 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" className={`gt-icon-btn gt-chat-btn ${open ? 'is-on' : ''}`} onClick={onToggle} aria-label="Chat" title="Chat">
        <ChatIcon />
        <AnimatePresence>
          {unread > 0 && !open && (
            <motion.span
              key={unread}
              className="gt-unread"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.4, 1] }}
              exit={{ scale: 0 }}
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.aside
            className="gt-chat"
            initial={{ x: '110%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '110%', opacity: 0.5 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <header>
              <span>Chat</span>
              <button type="button" className="gt-chat-close" onClick={onToggle} aria-label="Cerrar chat">✕</button>
            </header>
            <div className="gt-chat-list" ref={list}>
              {chat.length === 0 && <p className="gt-chat-empty">Nadie ha dicho nada… todavía.</p>}
              {chat.map((m) => (
                <div key={m.id} className={`gt-msg ${m.system ? 'is-system' : ''} ${m.from?.id === me ? 'is-mine' : ''}`}>
                  {!m.system && (
                    <b style={{ color: m.from?.color || '#653FD3' }}>
                      {m.from?.name}
                      {m.ts && <time dateTime={new Date(m.ts).toISOString()}>{timeOf(m.ts)}</time>}
                    </b>
                  )}
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
            <form className="gt-chat-form" onSubmit={send}>
              <input
                ref={input}
                value={text}
                maxLength={200}
                placeholder="Escribe algo…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') onToggle(); }}
              />
              <button type="submit" className="gt-btn gt-btn-accent" disabled={sending || !text.trim()}>Enviar</button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
});
