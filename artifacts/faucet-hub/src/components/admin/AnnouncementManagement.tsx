import { useState, useRef } from "react";
import { 
  useGetAdminAnnouncements, 
  useCreateAnnouncement, 
  useUpdateAnnouncement, 
  useDeleteAnnouncement,
  getGetAdminAnnouncementsQueryKey,
  Announcement
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit2, Plus, Trash2, Loader2, Image as ImageIcon, X, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { adminFetch } from "@/lib/auth";

const DEFAULT_ANNOUNCEMENT = {
  title: "",
  content: "",
  imageUrl: "",
  isActive: true
};

export function AnnouncementManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: announcements = [], isLoading } = useGetAdminAnnouncements({
    query: {
      queryKey: getGetAdminAnnouncementsQueryKey()
    }
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [deletingItem, setDeletingItem] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState<any>(DEFAULT_ANNOUNCEMENT);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement();
  const deleteMutation = useDeleteAnnouncement();

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await adminFetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const d = await res.json() as { url: string };
      setFormData((prev: any) => ({ ...prev, imageUrl: d.url }));
      toast({ title: "Image uploaded" });
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Try pasting a URL instead." });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData(DEFAULT_ANNOUNCEMENT);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingItem(item);
    setFormData({ ...item, imageUrl: item.imageUrl ?? "" });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!formData.title || !formData.content) return;

    const payload = {
      ...formData,
      imageUrl: formData.imageUrl?.trim() || null,
    };
    const mutation = editingItem ? updateMutation : createMutation;
    const mutateArgs = editingItem 
      ? { id: editingItem.id, data: payload }
      : { data: payload };

    (mutation as any).mutate(mutateArgs, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminAnnouncementsQueryKey() });
        setIsFormOpen(false);
        toast({ title: "Broadcast saved" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Failed to broadcast" });
      }
    });
  };

  const handleDelete = () => {
    if (!deletingItem) return;
    
    deleteMutation.mutate({ id: deletingItem.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminAnnouncementsQueryKey() });
        setIsDeleteOpen(false);
        toast({ title: "Broadcast cleared" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase">System Broadcasts</h2>
        <Button onClick={handleOpenCreate} size="sm" className="font-mono">
          <Plus className="w-4 h-4 mr-2" /> New Broadcast
        </Button>
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-card/50">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[60px]">ID</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[70px]">Image</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[120px]">Created</TableHead>
              <TableHead className="text-right w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell>
              </TableRow>
            ) : announcements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-mono">No active broadcasts.</TableCell>
              </TableRow>
            ) : (
              announcements.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.id}</TableCell>
                  <TableCell>
                    <div className="font-bold text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">{item.content}</div>
                  </TableCell>
                  <TableCell>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-10 h-7 object-cover rounded border border-border" />
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "default" : "secondary"} className="text-[10px]">
                      {item.isActive ? "LIVE" : "SILENT"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(item)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => { setDeletingItem(item); setIsDeleteOpen(true); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[520px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight">
              {editingItem ? "Update Broadcast" : "Transmit New Broadcast"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Transmission Header (Title) *</Label>
              <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="font-mono" />
            </div>
            
            <div className="space-y-2">
              <Label>Payload (Content) *</Label>
              <Textarea 
                value={formData.content} 
                onChange={e => setFormData({...formData, content: e.target.value})} 
                className="font-mono min-h-[100px]" 
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Banner Image <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(file);
                  e.target.value = "";
                }}
              />

              {/* Upload button + URL input row */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono font-semibold transition-colors"
                  style={{
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e",
                  }}
                >
                  {uploadingImage
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Upload className="w-3.5 h-3.5" />
                  }
                  {uploadingImage ? "Uploading…" : "Upload"}
                </button>

                <div className="relative flex-1">
                  <Input
                    placeholder="or paste image URL…"
                    value={formData.imageUrl ?? ""}
                    onChange={e => setFormData({...formData, imageUrl: e.target.value})}
                    className="font-mono text-xs pr-7"
                  />
                  {formData.imageUrl && (
                    <button
                      onClick={() => setFormData({...formData, imageUrl: ""})}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {formData.imageUrl && (
                <div className="rounded-md overflow-hidden border border-border" style={{ maxHeight: 120 }}>
                  <img
                    src={formData.imageUrl}
                    alt="Preview"
                    className="w-full object-cover"
                    style={{ maxHeight: 120 }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/20">
              <Label className="cursor-pointer">Active Relay</Label>
              <Switch checked={formData.isActive} onCheckedChange={c => setFormData({...formData, isActive: c})} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} className="font-mono">Abort</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending || !formData.title || !formData.content} className="font-mono">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transmit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive font-mono uppercase">Terminate Broadcast</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
