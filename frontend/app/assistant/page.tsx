"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { LiveRegion, useToast } from "@/components/Toast";
import {
  ErrorState,
  Skeleton,
  btnPrimary,
  btnSecondary,
  eyebrowClass,
} from "@/components/ui";
import {
  type AssistantActionType,
  type AssistantCitation,
  type AssistantReply,
  confirmAssistantAction,
  dismissAssistantAction,
  getGuide,
  sendAssistantMessage,
  toApiError,
} from "@/lib/api";
import { useLoader } from "@/lib/use-loader";

const SUGGESTIONS = [
  "What are your opening hours?",
  "Where do I park?",
  "Show my appointments",
  "Cancel my next appointment",
  "Book me with a pediatrician",
];

const ACTION_LABEL: Record<AssistantActionType, string> = {
  book: "Book appointment",
  cancel: "Cancel appointment",
  reschedule: "Reschedule appointment",
};

// Card status moves: pending -> confirming -> confirmed | failed;
// pending or failed -> dismissing -> dismissed (or back to its previous status on error).
type CardStatus = "pending" | "confirming" | "confirmed" | "failed" | "dismissing" | "dismissed";

interface ActionCard {
  actionId: number;
  type: AssistantActionType;
  summary: string;
  status: CardStatus;
  error: string | null;
}

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      text: string;
      citations: AssistantCitation[];
      card: ActionCard | null;
    };

interface FailedSend {
  text: string;
  message: string;
}

const chipClass =
  "inline-flex min-h-11 items-center rounded-[3px] border border-line bg-bg px-4 text-left text-sm text-ink transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40";

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<FailedSend | null>(null);
  const [openGuide, setOpenGuide] = useState<AssistantCitation | null>(null);
  const { message: toast, show: showToast } = useToast();
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(new Set<number>());

  function nextId() {
    idRef.current += 1;
    return idRef.current;
  }

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, sending, failed]);

  async function send(text: string, echo: boolean) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setFailed(null);
    if (echo) {
      const userId = nextId();
      setMessages((prev) => [...prev, { id: userId, role: "user", text: trimmed }]);
    }
    try {
      const reply = await sendAssistantMessage(trimmed);
      const replyId = nextId();
      setMessages((prev) => [...prev, toAssistantMessage(replyId, reply)]);
    } catch (err) {
      setFailed({ text: trimmed, message: toApiError(err).message });
    } finally {
      setSending(false);
    }
  }

  function updateCard(messageId: number, patch: Partial<ActionCard>) {
    setMessages((prev) =>
      prev.map((message) =>
        message.role === "assistant" && message.id === messageId && message.card
          ? { ...message, card: { ...message.card, ...patch } }
          : message,
      ),
    );
  }

  async function confirm(messageId: number, card: ActionCard) {
    if (card.status !== "pending" || inFlight.current.has(card.actionId)) return;
    inFlight.current.add(card.actionId);
    updateCard(messageId, { status: "confirming", error: null });
    try {
      await confirmAssistantAction(card.actionId);
      const done = `Done: ${card.summary}`;
      updateCard(messageId, { status: "confirmed" });
      const doneId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: doneId, role: "assistant", text: done, citations: [], card: null },
      ]);
      showToast(done);
    } catch (err) {
      updateCard(messageId, { status: "failed", error: toApiError(err).message });
    } finally {
      inFlight.current.delete(card.actionId);
    }
  }

  async function dismiss(messageId: number, card: ActionCard) {
    if (!canDismiss(card.status) || inFlight.current.has(card.actionId)) return;
    inFlight.current.add(card.actionId);
    const previous = card.status;
    updateCard(messageId, { status: "dismissing", error: null });
    try {
      await dismissAssistantAction(card.actionId);
      updateCard(messageId, { status: "dismissed" });
    } catch (err) {
      updateCard(messageId, { status: previous, error: toApiError(err).message });
    } finally {
      inFlight.current.delete(card.actionId);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input;
    setInput("");
    void send(text, true);
  }

  return (
    <div>
      <p className={eyebrowClass}>Assistant</p>
      <h1 className="font-serif text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.1] font-normal tracking-[-0.03em]">
        Ask Terra
      </h1>
      <p className="mt-5 max-w-xl text-sm leading-7 text-muted">
        The assistant only answers clinic information and appointment questions and never gives
        medical advice. It can suggest a change to your appointments, but nothing changes until you
        press Confirm.
      </p>

      <section
        aria-label="Conversation"
        className="mt-8 flex flex-col rounded-[4px] border border-line bg-panel"
      >
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          className="flex h-[55vh] min-h-[320px] flex-col gap-4 overflow-y-auto p-4 md:p-6"
        >
          {messages.length === 0 && !sending && (
            <p className="my-auto text-center text-sm text-muted">
              Ask a question or choose a suggestion below.
            </p>
          )}
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onOpenGuide={setOpenGuide}
              onConfirm={(card) => confirm(message.id, card)}
              onDismiss={(card) => dismiss(message.id, card)}
            />
          ))}
          {sending && (
            <div role="status" aria-live="polite" className="mr-auto flex items-center gap-2 text-sm text-muted">
              <span className="inline-block size-2 animate-pulse rounded-full bg-muted" aria-hidden="true" />
              Assistant is replying…
            </div>
          )}
          {failed && (
            <div role="alert" className="rounded-[3px] border border-danger p-4 text-sm">
              <p className="text-danger">
                The assistant could not reply. {failed.message}
              </p>
              <button
                type="button"
                onClick={() => void send(failed.text, false)}
                disabled={sending}
                className={`${btnSecondary} mt-3`}
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-line p-4 md:p-6">
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={sending}
                onClick={() => void send(suggestion, true)}
                className={chipClass}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-3">
            <label htmlFor="assistant-message" className="sr-only">
              Your message
            </label>
            <input
              id="assistant-message"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoComplete="off"
              placeholder="Ask about hours, parking or your visits"
              className="min-h-11 min-w-0 flex-1 rounded-[3px] border border-line bg-bg px-4 text-sm text-ink placeholder:text-muted"
            />
            <button type="submit" disabled={sending || input.trim() === ""} className={btnPrimary}>
              Send
            </button>
          </form>
        </div>
      </section>

      <LiveRegion message={toast} />

      {openGuide && (
        <GuideDialog key={openGuide.slug} citation={openGuide} onClose={() => setOpenGuide(null)} />
      )}
    </div>
  );
}

function canDismiss(status: CardStatus): boolean {
  return status === "pending" || status === "failed";
}

function toAssistantMessage(id: number, reply: AssistantReply): ChatMessage {
  const action = reply.proposed_action;
  return {
    id,
    role: "assistant",
    text: reply.reply,
    citations: reply.citations,
    card: action
      ? {
          actionId: action.id,
          type: action.type,
          summary: action.summary,
          status: "pending",
          error: null,
        }
      : null,
  };
}

function MessageItem({
  message,
  onOpenGuide,
  onConfirm,
  onDismiss,
}: {
  message: ChatMessage;
  onOpenGuide: (citation: AssistantCitation) => void;
  onConfirm: (card: ActionCard) => void;
  onDismiss: (card: ActionCard) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-[4px] bg-soft px-4 py-3 text-sm leading-6">
        <span className="sr-only">You: </span>
        {message.text}
      </div>
    );
  }

  return (
    <div className="mr-auto flex max-w-[92%] flex-col gap-3">
      <div className="rounded-[4px] border border-line bg-bg px-4 py-3 text-sm leading-6">
        <span className="sr-only">Assistant: </span>
        <p className="whitespace-pre-line">{message.text}</p>
        {message.citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.citations.map((citation) => (
              <button
                key={citation.slug}
                type="button"
                onClick={() => onOpenGuide(citation)}
                className="inline-flex min-h-11 items-center rounded-[3px] border border-accent px-3 text-xs font-medium text-accent hover:bg-soft"
              >
                Guide: {citation.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {message.card && (
        <ActionCardView card={message.card} onConfirm={onConfirm} onDismiss={onDismiss} />
      )}
    </div>
  );
}

function ActionCardView({
  card,
  onConfirm,
  onDismiss,
}: {
  card: ActionCard;
  onConfirm: (card: ActionCard) => void;
  onDismiss: (card: ActionCard) => void;
}) {
  const busy = card.status === "confirming" || card.status === "dismissing";
  const showConfirm = card.status === "pending" || card.status === "confirming";
  const showDismiss = canDismiss(card.status) || card.status === "dismissing";

  let statusText: string | null = null;
  if (card.status === "confirmed") statusText = "Confirmed.";
  if (card.status === "dismissed") statusText = "Dismissed. Nothing was changed.";

  return (
    <section
      aria-label="Proposed action"
      className="rounded-[4px] border-2 border-accent bg-soft p-4 text-sm"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
        {ACTION_LABEL[card.type]}
      </p>
      <p className="mt-2 leading-6">{card.summary}</p>
      {card.error && (
        <p role="alert" className="mt-3 text-danger">
          {card.error}
        </p>
      )}
      {statusText && <p className="mt-3 text-muted">{statusText}</p>}
      {(showConfirm || showDismiss) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {showConfirm && (
            <button
              type="button"
              disabled={busy}
              aria-busy={card.status === "confirming"}
              onClick={() => onConfirm(card)}
              className={btnPrimary}
            >
              {card.status === "confirming" ? "Confirming…" : "Confirm"}
            </button>
          )}
          {showDismiss && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDismiss(card)}
              className={btnSecondary}
            >
              {card.status === "dismissing" ? "Dismissing…" : "Dismiss"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function GuideDialog({
  citation,
  onClose,
}: {
  citation: AssistantCitation;
  onClose: () => void;
}) {
  const load = useCallback(() => getGuide(citation.slug), [citation.slug]);
  const { state, retry } = useLoader(load);

  return (
    <Modal title={citation.title} onClose={onClose}>
      {state.status === "loading" && <Skeleton lines={5} />}
      {state.status === "error" && (
        <ErrorState title="Could not load this guide" message={state.error.message} onRetry={retry} />
      )}
      {state.status === "ready" && (
        <p className="whitespace-pre-line text-sm leading-7">{state.data.body}</p>
      )}
    </Modal>
  );
}
