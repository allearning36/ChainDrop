import { useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { 
  useGetAdminBanners, 
  useCreateBanner, 
  useUpdateBanner, 
  useDeleteBanner,
  getGetAdminBannersQueryKey,
  Banner
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Edit2, Plus, Trash2, Loader2, Image as ImageIcon, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_BANNER = {
  imageUrl: "",
  linkUrl: "",
  altText: "",
  isActive: true,
  sortOrder: 0
};

export function BannerManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: banners = [], isLoading } = useGetAdminBanners({
    query: {
      queryKey: getGetAdminBannersQueryKey()
    }
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [deletingBanner, setDeletingBanner] = useState<Banner | null>(null);
  const [formData, setFormData] = useState<any>(DEFAULT_BANNER);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateBanner();
  const updateMutation = useUpdateBanner();
  const deleteMutation = useDeleteBanner();

  const handleOpenCreate = () => {
    setEditingBanner(null);
    setFormData(DEFAULT_BANNER);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData(banner);
    setIsFormOpen(true);
  };

  const handleOpenDelete = (banner: Banner) => {
    setDeletingBanner(banner);
    setIsDeleteOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please select an image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Image must be under 5 MB." });
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);

      const res = await fetch("/api/uploads/banner", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Upload failed");
      }

      const { url } = await res.json() as { url: string };
      setFormData((prev: any) => ({ ...prev, imageUrl: url }));
      toast({ title: "Uploaded", description: "Image uploaded successfully." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err?.message || "Could not upload image." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    if (!formData.imageUrl) return;

    const payload = {
      ...formData,
      sortOrder: Number(formData.sortOrder)
    };

    const mutation = editingBanner ? updateMutation : createMutation;
    const mutateArgs = editingBanner 
      ? { id: editingBanner.id, data: payload }
      : { data: payload };

    (mutation as any).mutate(mutateArgs, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminBannersQueryKey() });
        setIsFormOpen(false);
        toast({ title: "Success", description: "Banner saved successfully." });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Failed to save banner" });
      }
    });
  };

  const handleDelete = () => {
    if (!deletingBanner) return;
    
    deleteMutation.mutate({ id: deletingBanner.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminBannersQueryKey() });
        setIsDeleteOpen(false);
        toast({ title: "Success", description: "Banner deleted." });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Failed to delete" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-xl font-bold font-mono tracking-tight uppercase">Advertisement Slots</h2>
        <Button onClick={handleOpenCreate} size="sm" className="font-mono">
          <Plus className="w-4 h-4 mr-2" /> Add Banner
        </Button>
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-card/50">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sort Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : banners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground font-mono">
                  No banners active.
                </TableCell>
              </TableRow>
            ) : (
              banners.map((banner) => (
                <TableRow key={banner.id}>
                  <TableCell className="font-mono text-xs">{banner.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-32 bg-muted rounded overflow-hidden border border-border flex items-center justify-center shrink-0">
                        {banner.imageUrl ? (
                          <img src={banner.imageUrl} alt={banner.altText || ""} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground max-w-[200px] truncate" title={banner.linkUrl || "No link"}>
                        {banner.linkUrl || "No link attached"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={banner.isActive ? "default" : "secondary"} className="text-[10px]">
                      {banner.isActive ? "ACTIVE" : "HIDDEN"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{banner.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(banner)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleOpenDelete(banner)}>
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
              {editingBanner ? "Edit Banner Slot" : "Upload Banner"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Image upload area */}
            <div className="space-y-2">
              <Label>Banner Image (1200×600 recommended) *</Label>

              {/* Upload from gallery button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed font-mono gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="w-4 h-4" /> Choose from Gallery / Device</>
                )}
              </Button>

              {/* OR divider */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1 border-t border-border" />
                <span>or paste a URL</span>
                <div className="flex-1 border-t border-border" />
              </div>

              <Input
                value={formData.imageUrl}
                onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="https://example.com/banner.jpg"
                className="font-mono text-sm"
              />
            </div>

            {/* Preview */}
            {formData.imageUrl && (
              <div className="w-full aspect-[1200/600] bg-muted rounded border border-border overflow-hidden relative">
                <img
                  src={formData.imageUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1200 600"><rect fill="%23222" width="1200" height="600"/><text fill="%23fff" x="50%" y="50%" font-family="monospace" font-size="20" text-anchor="middle" dominant-baseline="middle">Invalid Image URL</text></svg>';
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Click Destination (Link URL)</Label>
              <Input value={formData.linkUrl} onChange={e => setFormData({...formData, linkUrl: e.target.value})} placeholder="https://..." className="font-mono" />
            </div>
            
            <div className="space-y-2">
              <Label>Alt Text</Label>
              <Input value={formData.altText} onChange={e => setFormData({...formData, altText: e.target.value})} className="font-mono" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: e.target.value})} className="font-mono" />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Label>Active Status</Label>
                <Switch checked={formData.isActive} onCheckedChange={c => setFormData({...formData, isActive: c})} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} className="font-mono">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || !formData.imageUrl || uploading}
              className="font-mono"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive font-mono uppercase">Remove Banner</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this banner?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
