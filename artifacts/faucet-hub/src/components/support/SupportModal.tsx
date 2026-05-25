import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, MessageCircle, Loader2, Key, Copy, Check, RotateCcw, ChevronDown } from "lucide-react";

const STORAGE_KEY = "chainDrop_supportConvId";
const TOKEN_KEY   = "chainDrop_supportToken";

type Message = {
  id: number;
  content: string;
  isAdmin: boolean;
  createdAt: string;
};

type Step = "info" | "chat" | "restore";

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({ open, onOpenChange }: SupportModalProps) {
  const [step, setStep]         = useState<Step>("info");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [convId, setConvId]     = useState<number | null>(null);
  const [userToken, setUserToken] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg]     = useState("");
  const [sending, setSending]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [restoreKey, setRestoreKey] = useState("");
  const [restoring, setRestoring] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const recoveryKey = convId && userToken ? `${convId}:${userToken}` : "";

  useEffect(() => {
    if (!open) return;
    const storedId    = localStorage.getItem(STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedId && storedToken) {
      const id = parseInt(storedId);
      if (!isNaN(id)) {
        setConvId(id);
        setUserToken(storedToken);
        setStep("chat");
        void loadMessages(id, storedToken);
      }
    }
  }, [open]);

  useEffect(() => {
    if (step === "chat" && convId && userToken) {
      pollRef.current = setInterval(() => void loadMessages(convId, userToken), 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, convId, userToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages(id: number, token: string) {
    try {
      const res = await fetch(`/api/support/conversations/${id}/messages`, {
        headers: { "x-user-token": token },
      });
      if (!res.ok) return;
      const data = await res.json() as { messages: Message[] };
      setMessages(data.messages ?? []);
    } catch { /* ignore */ }
  }

  function handleClose() {
    onOpenChange(false);
    setError("");
  }

  async function handleStart() {
    if (!name.trim() || !email.trim() || !firstMsg.trim()) {
      setError("Please fill all fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/support/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: name.trim(), userEmail: email.trim(), message: firstMsg.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      const conv = await res.json() as { id: number; userToken: string };
      localStorage.setItem(STORAGE_KEY, String(conv.id));
      localStorage.setItem(TOKEN_KEY, conv.userToken);
      setConvId(conv.id);
      setUserToken(conv.userToken);
      await loadMessages(conv.id, conv.userToken);
      setStep("chat");
      setShowKey(true);
    } catch {
      setError("Failed to start conversation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore() {
    const parts = restoreKey.trim().split(":");
    if (parts.length < 2) { setError("Invalid recovery key format."); return; }
    const id = parseInt(parts[0]);
    const token = parts.slice(1).join(":");
    if (isNaN(id) || !token) { setError("Invalid recovery key."); return; }
    setError("");
    setRestoring(true);
    try {
      const res = await fetch(`/api/support/restore?convId=${id}&token=${encodeURIComponent(token)}`);
      if (!res.ok) { setError("Recovery key not recognised. Please check and try again."); return; }
      localStorage.setItem(STORAGE_KEY, String(id));
      localStorage.setItem(TOKEN_KEY, token);
      setConvId(id);
      setUserToken(token);
      await loadMessages(id, token);
      setStep("chat");
    } catch {
      setError("Failed to restore. Please try again.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleSend() {
    if (!newMsg.trim() || !convId || !userToken) return;
    setSending(true);
    const content = newMsg.trim();
    setNewMsg("");
    try {
      const res = await fetch(`/api/support/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-token": userToken },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadMessages(convId, userToken);
    } catch {
      setNewMsg(content);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function copyKey() {
    navigator.clipboard.writeText(recoveryKey).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    });
  }

  function handleNewConversation() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setConvId(null);
    setUserToken("");
    setMessages([]);
    setName("");
    setEmail("");
    setFirstMsg("");
    setShowKey(false);
    setStep("info");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden gap-0"
        style={{ background: "hsl(var(--background))", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center gap-3 space-y-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#15803d,#22c55e)", boxShadow: "0 0 10px rgba(34,197,94,0.4)" }}
          >
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-semibold leading-none">ChainDrop Support</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">We usually reply within a few hours</p>
          </div>
          {step === "chat" && (
            <button
              onClick={handleNewConversation}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
              title="Start new conversation"
            >
              New
            </button>
          )}
        </DialogHeader>

        {/* Step: Info collection */}
        {step === "info" && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Tell us a bit about yourself, then describe your issue.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-name" className="text-xs font-medium">Your Name</Label>
              <Input
                id="sup-name"
                placeholder="Alice"
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-email" className="text-xs font-medium">Email</Label>
              <Input
                id="sup-email"
                type="email"
                placeholder="alice@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-msg" className="text-xs font-medium">How can we help?</Label>
              <Textarea
                id="sup-msg"
                placeholder="Describe your issue..."
                value={firstMsg}
                onChange={e => setFirstMsg(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              onClick={handleStart}
              disabled={submitting}
              className="w-full h-9 font-mono font-semibold text-sm"
              style={{ background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff" }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Start Conversation
            </Button>

            <div className="border-t border-border pt-3">
              <button
                onClick={() => { setStep("restore"); setError(""); }}
                className="w-full text-xs font-mono text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1.5 py-1"
              >
                <Key className="w-3.5 h-3.5" />
                Restore previous chat with recovery key
              </button>
            </div>
          </div>
        )}

        {/* Step: Restore */}
        {step === "restore" && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm font-semibold font-mono">Restore Chat</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste the recovery key you saved from your previous conversation. It looks like <span className="font-mono text-primary">123:xxxxxxxx-xxxx-…</span>
            </p>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Recovery Key</Label>
              <Input
                placeholder="123:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={restoreKey}
                onChange={e => setRestoreKey(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              onClick={handleRestore}
              disabled={restoring || !restoreKey.trim()}
              className="w-full h-9 font-mono font-semibold text-sm"
              style={{ background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff" }}
            >
              {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Restore
            </Button>
            <button
              onClick={() => { setStep("info"); setError(""); }}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              ← Back
            </button>
          </div>
        )}

        {/* Step: Chat */}
        {step === "chat" && (
          <div className="flex flex-col" style={{ height: "460px" }}>
            {/* Recovery Key banner (shown after first open) */}
            {showKey && recoveryKey && (
              <div
                className="mx-3 mt-3 rounded-lg px-3 py-2.5 flex items-start gap-2.5"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
              >
                <Key className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-primary mb-1">Save your Recovery Key</p>
                  <p className="text-[10px] text-muted-foreground mb-1.5">You'll need this to restore your chat if you clear browser data.</p>
                  <div className="flex items-center gap-1.5">
                    <code className="text-[10px] font-mono bg-black/20 px-1.5 py-0.5 rounded truncate flex-1" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {recoveryKey}
                    </code>
                    <button onClick={copyKey} className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors">
                      {keyCopied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
                <button onClick={() => setShowKey(false)} className="text-muted-foreground hover:text-foreground text-xs shrink-0">✕</button>
              </div>
            )}

            {/* Key toggle button (when banner hidden) */}
            {!showKey && recoveryKey && (
              <button
                onClick={() => setShowKey(true)}
                className="mx-3 mt-2 flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                <Key className="w-3 h-3" />
                Show recovery key
                <ChevronDown className="w-3 h-3" />
              </button>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 mt-1">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No messages yet...
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.isAdmin ? "justify-start" : "justify-end"}`}>
                  <div
                    className="max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                    style={
                      msg.isAdmin
                        ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }
                        : { background: "linear-gradient(135deg,#15803d,#22c55e)", color: "#fff" }
                    }
                  >
                    {msg.isAdmin && (
                      <div className="text-[10px] font-semibold text-primary mb-0.5 uppercase tracking-wider">Support</div>
                    )}
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    <div className={`text-[10px] mt-1 ${msg.isAdmin ? "text-muted-foreground" : "text-green-100"}`}>
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border px-3 py-2 flex items-end gap-2">
              <Textarea
                placeholder="Type a message… (Enter to send)"
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className="flex-1 text-sm resize-none min-h-[36px] max-h-[100px]"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={sending || !newMsg.trim()}
                className="h-9 w-9 shrink-0"
                style={{ background: "linear-gradient(135deg,#15803d,#22c55e)" }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
