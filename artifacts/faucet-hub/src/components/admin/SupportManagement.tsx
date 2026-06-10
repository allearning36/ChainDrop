import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Send, Loader2, MessageCircle, Mail, CheckCircle, Circle,
  ArrowLeft, Search, Image as ImageIcon, X, Clock,
} from "lucide-react";
import { adminFetch } from "@/lib/auth";

type Msg = {
  id: number;
  conversationId: number;
  content: string;
  imageUrl?: string | null;
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

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function avatarColor(name: string) {
  const colors = [
    "linear-gradient(135deg,#1d4ed8,#60a5fa)",
    "linear-gradient(135deg,#15803d,#22c55e)",
    "linear-gradient(135deg,#7c3aed,#a78bfa)",
    "linear-gradient(135deg,#b45309,#fbbf24)",
    "linear-gradient(135deg,#be123c,#fb7185)",
    "linear-gradient(135deg,#0e7490,#22d3ee)",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await adminFetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

async function uploadSupportImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/uploads/support", { method: "POST", body: fd });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json() as { url: string };
  return data.url;
}

export function SupportManagement({ onUnreadCount }: SupportManagementProps) {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<ConvDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [search, setSearch] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const filtered = conversations.filter(c =>
    !search.trim() ||
    c.userName.toLowerCase().includes(search.toLowerCase()) ||
    c.userEmail.toLowerCase().includes(search.toLowerCase())
  );

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await apiFetch("/api/admin/support") as Conv[];
      const list = Array.isArray(data) ? data : [];
      setConversations(list);
      onUnreadCount?.(list.filter(c => c.hasUnread).length);
    } catch { /* ignore */ }
    finally { setLoadingList(false); }
  }, [onUnreadCount]);

  useEffect(() => {
    void loadList();
    listPollRef.current = setInterval(() => void loadList(), 5000);
    return () => { if (listPollRef.current) clearInterval(listPollRef.current); };
  }, [loadList]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const data = await apiFetch(`/api/admin/support/${id}`) as ConvDetail;
      setSelected(data);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, hasUnread: false } : c));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!selected) return;
    detailPollRef.current = setInterval(() => void loadDetail(selected.id), 5000);
    return () => { if (detailPollRef.current) clearInterval(detailPollRef.current); };
  }, [selected?.id, loadDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages]);

  async function handleSelect(conv: Conv) {
    setSelected(null);
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/api/admin/support/${conv.id}`) as ConvDetail;
      setSelected(data);
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, hasUnread: false } : c));
      void loadList();
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleBack() {
    setSelected(null);
    setReplyText("");
    clearImagePreview();
    if (detailPollRef.current) { clearInterval(detailPollRef.current); detailPollRef.current = null; }
  }

  function clearImagePreview() {
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleReply() {
    if ((!replyText.trim() && !imageFile) || !selected) return;
    setSending(true);
    const content = replyText.trim();
    setReplyText("");

    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        setUploadingImage(true);
        try { imageUrl = await uploadSupportImage(imageFile); }
        finally { setUploadingImage(false); }
        clearImagePreview();
      }

      await apiFetch(`/api/admin/support/${selected.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content, imageUrl }),
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
  const showChat = !!selected || loadingDetail;

  return (
    <div
      className="flex border border-border rounded-xl overflow-hidden"
      style={{ minHeight: "600px", maxHeight: "calc(100vh - 180px)" }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div
        className={`flex flex-col border-r border-border shrink-0 ${showChat ? "hidden md:flex" : "flex"}`}
        style={{ width: "300px", minWidth: "260px" }}
      >
        {/* Sidebar header */}
        <div
          className="px-4 py-3 border-b border-border shrink-0"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm">Chats</span>
            {totalUnread > 0 && (
              <span
                className="ml-auto inline-flex items-center justify-center font-bold text-[10px] text-white rounded-full px-1.5 min-w-[18px] h-[18px]"
                style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.5)" }}
              >
                {totalUnread}
              </span>
            )}
            {loadingList && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search user…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background/60"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && !loadingList && (
            <div className="py-12 text-center text-muted-foreground text-xs">
              {search ? "No results" : "No conversations yet"}
            </div>
          )}
          {filtered.map(conv => {
            const isActive = selected?.id === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => void handleSelect(conv)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors border-b border-border/40 ${
                  isActive
                    ? "bg-primary/10 border-l-2 border-primary"
                    : "hover:bg-white/5"
                }`}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 relative"
                  style={{ background: avatarColor(conv.userName) }}
                >
                  {conv.userName[0]?.toUpperCase() ?? "?"}
                  {conv.hasUnread && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                      style={{ background: "#ef4444" }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-sm truncate leading-tight ${conv.hasUnread ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
                      {conv.userName}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                      {timeLabel(conv.updatedAt)}
                    </span>
                  </div>
                  <div className={`text-xs truncate ${conv.hasUnread ? "text-foreground/70" : "text-muted-foreground"}`}>
                    {conv.lastMessage || (
                      <span className="flex items-center gap-1">
                        <Mail className="w-2.5 h-2.5" />
                        {conv.userEmail}
                      </span>
                    )}
                  </div>
                  {conv.status === "closed" && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">closed</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chat Panel ──────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 ${showChat ? "flex" : "hidden md:flex"}`}>
        {/* Loading state */}
        {loadingDetail && !selected && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!loadingDetail && !selected && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageCircle className="w-12 h-12 opacity-10" />
            <span className="text-sm">Select a conversation</span>
          </div>
        )}

        {/* Chat */}
        {selected && (
          <>
            {/* Chat header */}
            <div
              className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              {/* Back button (mobile) */}
              <button
                onClick={handleBack}
                className="md:hidden p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
                style={{ background: avatarColor(selected.userName) }}
              >
                {selected.userName[0]?.toUpperCase() ?? "?"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm leading-tight">{selected.userName}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="w-2.5 h-2.5" />
                  <span className="truncate">{selected.userEmail}</span>
                  <span className="shrink-0">·</span>
                  <Clock className="w-2.5 h-2.5 shrink-0" />
                  <span className="shrink-0 font-mono">{new Date(selected.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
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
                    ? <><CheckCircle className="w-3 h-3 text-green-500" />Close</>
                    : <><Circle className="w-3 h-3" />Reopen</>
                }
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
              {selected.messages?.map(msg => (
                <MessageBubble key={msg.id} msg={msg} userName={selected.userName} />
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Image preview */}
            {imagePreview && (
              <div
                className="mx-3 mb-2 rounded-xl overflow-hidden relative inline-flex self-end"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <img src={imagePreview} alt="preview" className="max-h-32 max-w-48 object-cover rounded-xl" />
                <button
                  onClick={clearImagePreview}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}

            {/* Reply bar */}
            <div className="border-t border-border px-3 py-2 flex items-end gap-2 shrink-0">
              {selected.status === "closed" ? (
                <div className="flex-1 text-xs text-muted-foreground text-center py-2">
                  Conversation closed — reopen to reply
                </div>
              ) : (
                <>
                  {/* Image upload */}
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Send image"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>

                  <Textarea
                    placeholder="Type a reply… (Enter to send)"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="flex-1 text-sm resize-none min-h-[36px] max-h-[120px]"
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                  />
                  <Button
                    size="icon"
                    onClick={handleReply}
                    disabled={sending || uploadingImage || (!replyText.trim() && !imageFile)}
                    className="h-9 w-9 shrink-0"
                    style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)" }}
                  >
                    {(sending || uploadingImage) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, userName }: { msg: Msg; userName: string }) {
  const [imgOpen, setImgOpen] = useState(false);

  return (
    <div className={`flex flex-col ${msg.isAdmin ? "items-end" : "items-start"}`}>
      <div
        className="max-w-[75%] rounded-2xl overflow-hidden text-sm leading-relaxed"
        style={
          msg.isAdmin
            ? { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff" }
            : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }
        }
      >
        {/* Image */}
        {msg.imageUrl && (
          <div className="cursor-pointer" onClick={() => setImgOpen(true)}>
            <img
              src={msg.imageUrl}
              alt="attachment"
              className="max-w-full max-h-56 object-cover"
              style={{ display: "block" }}
            />
          </div>
        )}

        {/* Text */}
        {msg.content && (
          <div className="px-3 py-2">
            {!msg.isAdmin && (
              <div className="text-[10px] font-semibold text-primary mb-0.5 uppercase tracking-wider">{userName}</div>
            )}
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            <div className={`text-[10px] mt-1 ${msg.isAdmin ? "text-blue-100" : "text-muted-foreground"}`}>
              {formatTime(msg.createdAt)}
            </div>
          </div>
        )}

        {/* Image-only timestamp */}
        {msg.imageUrl && !msg.content && (
          <div className={`px-3 py-1.5 text-[10px] ${msg.isAdmin ? "text-blue-100" : "text-muted-foreground"}`}>
            {formatTime(msg.createdAt)}
          </div>
        )}
      </div>

      {msg.isAdmin && msg.userSeen && (
        <div className="flex items-center gap-1 mt-0.5 mr-1">
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-[10px] font-mono text-green-400 tracking-wide">Seen</span>
        </div>
      )}

      {/* Lightbox */}
      {imgOpen && msg.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setImgOpen(false)}
        >
          <img src={msg.imageUrl} alt="attachment" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white bg-white/10 rounded-full p-2 hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
