import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, MessageCircle, Loader2 } from "lucide-react";

const STORAGE_KEY = "chainDrop_supportConvId";
const TOKEN_KEY   = "chainDrop_supportToken";

type Message = {
  id: number;
  content: string;
  isAdmin: boolean;
  createdAt: string;
};

type Step = "info" | "chat";

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing conversation from localStorage on open
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

  // Poll for new messages when in chat step
  useEffect(() => {
    if (step === "chat" && convId && userToken) {
      pollRef.current = setInterval(() => void loadMessages(convId, userToken), 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, convId, userToken]);

  // Scroll to bottom when messages change
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
    } catch {
      setError("Failed to start conversation. Please try again.");
    } finally {
      setSubmitting(false);
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
          </div>
        )}

        {/* Step: Chat */}
        {step === "chat" && (
          <div className="flex flex-col" style={{ height: "420px" }}>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
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
