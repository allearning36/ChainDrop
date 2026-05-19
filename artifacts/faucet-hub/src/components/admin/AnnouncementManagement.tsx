import { useState } from "react";
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
import { Edit2, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const DEFAULT_ANNOUNCEMENT = {
  title: "",
  content: "",
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

  const createMutation = useCreateAnnouncement();
  const updateMutation = useUpdateAnnouncement();
  const deleteMutation = useDeleteAnnouncement();

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData(DEFAULT_ANNOUNCEMENT);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingItem(item);
    setFormData(item);
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!formData.title || !formData.content) return;

    const payload = formData;
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
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell>
              </TableRow>
            ) : announcements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground font-mono">No active broadcasts.</TableCell>
              </TableRow>
            ) : (
              announcements.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.id}</TableCell>
                  <TableCell>
                    <div className="font-bold">{item.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">{item.content}</div>
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
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
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
                className="font-mono min-h-[120px]" 
              />
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
