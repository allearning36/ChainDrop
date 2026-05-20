import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, MessageCircle, User, Mail, Clock, CheckCircle, Circle } from "lucide-react";
import { getToken } from "@/lib/auth";

type Msg = {
  id: number;
  conversationId: number;
  content: string;
  isAdmin: boolean;
  userSeen?: boolean;
  createdAt: string;
};
type Conv = {
  id: number;
  userName: string;
  userEmail: string;
  status: string;
  lastMessage: string | null;
  hasUnread: boolean;
  createdAt: string;
  updatedAt: string;
};
type ConvDetail = Conv & { messages: Msg[] };

interface SupportManagementProps {
  onUnreadCount?: (n: number) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

export function SupportManagement({ onUnreadCount }: SupportManagementProps) {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<ConvDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await apiFetch("/api/admin/support") as Conv[];
      setConversations(data ?? []);
      const unread = (data ?? []).filter(c => c.hasUnread).length;
      onUnreadCount?.(unread);
    } finally {
      setLoadingList(false);
    }
  }, [onUnreadCount]);

  useEffect(() => {
    void loadList();
    // Poll list every 15s for unread badge updates
    listPollRef.current = setInterval(() => void loadList(), 15000);
    return () => { if (listPollRef.current) clearInterval(listPollRef.current); };
  }, [loadList]);

  // Poll selected conversation every 5s
  useEffect(() => {
    if (selected) {
      pollRef.current = setInterval(() => void loadDetail(selected.id), 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages]);

  async function loadDetail(id: number) {
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/api/admin/support/${id}`) as ConvDetail;
      setSelected(data);
      // After opening, refresh list to clear unread badge for this conv
      void loadList();
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleSelect(conv: Conv) {
    await loadDetail(conv.id);
  }

  async function handleReply() {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    const content = replyText.trim();
    setReplyText("");
    try {
      await apiFetch(`/api/admin/support/${selected.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      await loadDetail(selected.id);
      await loadList();
    } catch {
      setReplyText(content);
    } finally {
      setSending(false);
    }
  }

  async function handleToggleStatus() {
    if (!selected) return;
    setStatusUpdating(true);
    try {
      const newStatus = selected.status === "open" ? "closed" : "open";
      await apiFetch(`/api/admin/support/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await loadDetail(selected.id);
      await loadList();
    } finally {
      setStatusUpdating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleReply();
    }
  }

  const totalUnread = conversations.filter(c => c.hasUnread).length;

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border border-border rounded-xl overflow-hidden"
      style={{ minHeight: "560px" }}
    >
      {/* Sidebar */}
      <div className="border-r border-border flex flex-col bg-card/40">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="font-mono font-semibold text-sm flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" /> Conversations
            {totalUnread > 0 && (
              <span
                className="inline-flex items-center justify-center font-mono font-bold text-[10px] text-white rounded-full px-1.5 min-w-[18px] h-[18px]"
                style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.6)" }}
              >
                {totalUnread}
              </span>
            )}
          </span>
          {loadingList && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {conversations.length === 0 && !loadingList && (
            <div className="py-12 text-center text-muted-foreground text-sm">No conversations yet</div>
          )}
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => void handleSelect(conv)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors ${selected?.id === conv.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {/* Red dot for unread */}
                  {conv.hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: "#ef4444", boxShadow: "0 0 4px rgba(239,68,68,0.7)" }}
                    />
                  )}
                  <span className={`text-sm truncate ${conv.hasUnread ? "font-bold text-foreground" : "font-semibold"}`}>
                    {conv.userName}
                  </span>
                </div>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-wider font-semibold shrink-0"
                  style={conv.status === "open"
                    ? { background: "rgba(34,197,94,0.15)", color: "#22c55e" }
                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {conv.status}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{conv.userEmail}</span>
              </div>
              {conv.lastMessage && (
                <div className={`text-xs truncate ${conv.hasUnread ? "text-foreground/80" : "text-muted-foreground"}`}>
                  {conv.lastMessage}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {timeAgo(conv.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      {!selected ? (
        <div className="flex items-center justify-center text-muted-foreground flex-col gap-3">
          <MessageCircle className="w-10 h-10 opacity-20" />
          <span className="text-sm">Select a conversation to view</span>
        </div>
      ) : (
        <div className="flex flex-col bg-card/20">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
              style={{ background: "linear-gradient(135deg,#1d4ed8,#60a5fa)", color: "#fff" }}
            >
              {selected.userName[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{selected.userName}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {selected.userEmail}
                <span className="mx-1">·</span>
                <Clock className="w-3 h-3" />
                {formatDate(selected.createdAt)}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleStatus}
              disabled={statusUpdating}
              className="text-xs h-8 font-mono gap-1.5 shrink-0"
            >
              {statusUpdating
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : selected.status === "open"
                  ? <><CheckCircle className="w-3 h-3 text-green-500" /> Close</>
                  : <><Circle className="w-3 h-3" /> Reopen</>
              }
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" style={{ maxHeight: "380px" }}>
            {loadingDetail && !selected.messages?.length && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {selected.messages?.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.isAdmin ? "items-end" : "items-start"}`}>
                <div
                  className="max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    msg.isAdmin
                      ? { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff" }
                      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {!msg.isAdmin && (
                    <div className="text-[10px] font-semibold text-primary mb-0.5 uppercase tracking-wider flex items-center gap-1">
                      <User className="w-2.5 h-2.5" /> {selected.userName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <div className={`text-[10px] mt-1 ${msg.isAdmin ? "text-blue-100" : "text-muted-foreground"}`}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
                {/* "Seen" indicator — only for admin messages that user has read */}
                {msg.isAdmin && msg.userSeen && (
                  <div className="flex items-center gap-1 mt-0.5 mr-1">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] font-mono text-green-400 tracking-wide">Seen</span>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Reply bar */}
          <div className="border-t border-border px-3 py-2 flex items-end gap-2">
            {selected.status === "closed" ? (
              <div className="flex-1 text-xs text-muted-foreground text-center py-2">
                This conversation is closed. Reopen it to reply.
              </div>
            ) : (
              <>
                <Textarea
                  placeholder="Type a reply… (Enter to send)"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 text-sm resize-none min-h-[36px] max-h-[100px]"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <Button
                  size="icon"
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="h-9 w-9 shrink-0"
                  style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)" }}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
