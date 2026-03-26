"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRef, useEffect, useState, useMemo } from "react";

const SUGGESTIONS = [
  "¿Hay cancha disponible hoy?",
  "¿Qué horarios tienen mañana?",
  "¿Cuáles son los precios?",
  "¿Dónde queda la cancha?",
];

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("");
}

/** Renders `**bold**` as <strong>; keeps newlines via pre-wrap on parent. */
function AssistantFormattedText({ text }: { text: string }) {
  const segments = text.split(/(\*\*[\s\S]*?\*\*)/g);
  return (
    <>
      {segments.map((part, i) => {
        if (
          part.startsWith("**") &&
          part.endsWith("**") &&
          part.length > 4
        ) {
          return (
            <strong key={i} className="font-semibold text-emerald-200">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function Chat() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  );

  const { messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    void sendMessage({ text });
  };

  const hasMessages = messages.filter((m) => m.role !== "system").length > 0;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800/50">
        <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-lg font-bold shrink-0">
          ⚽
        </div>
        <div>
          <h1 className="font-semibold text-sm leading-tight">CanchaBot</h1>
          <p className="text-xs text-neutral-500">PRO CAMP EXPLORA</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-neutral-500">En línea</span>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-thin"
      >
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 flex items-center justify-center text-3xl mb-4">
              ⚽
            </div>
            <h2 className="text-lg font-semibold mb-1">¡Hola! Soy CanchaBot</h2>
            <p className="text-sm text-neutral-400 max-w-sm mb-8">
              Te ayudo a consultar disponibilidad y reservar canchas en{" "}
              <span className="text-emerald-400 font-medium">PRO CAMP EXPLORA</span>.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  className="text-left text-xs px-3 py-2.5 rounded-lg border border-neutral-800 hover:border-emerald-600/50 hover:bg-emerald-600/5 transition-colors text-neutral-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages
          .filter((m) => m.role !== "system")
          .map((message) => {
            const isUser = message.role === "user";
            const content = textFromMessage(message);

            if (!content && !isUser) return null;

            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? "bg-emerald-600 text-white rounded-br-md"
                      : "bg-neutral-800/80 text-neutral-100 rounded-bl-md"
                  }`}
                >
                  {isUser ? (
                    content
                  ) : (
                    <AssistantFormattedText text={content} />
                  )}
                </div>
              </div>
            );
          })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-800/80 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 focus-within:border-emerald-600/50 transition-colors"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 flex items-center justify-center transition-colors shrink-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="text-center text-[10px] text-neutral-600 mt-2">
          CanchaBot puede cometer errores. Confirma tu reserva directamente.
        </p>
      </div>
    </div>
  );
}
