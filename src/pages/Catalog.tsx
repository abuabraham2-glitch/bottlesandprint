import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useCatalog, useUpdateCatalogItem, useDeleteCatalogItem, CatalogItem } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Archive, Trash2, RotateCcw, ArrowUp, ArrowDown, Paperclip, Upload, ExternalLink, Download, X } from "lucide-react";
import { toast } from "sonner";

function formatLastRun(val: string | null): string {
  if (!val) return "—";
  if (/^[A-Za-z]/.test(val)) return val;
  const match = val.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const idx = parseInt(match[2], 10) - 1;
    if (idx >= 0 && idx < 12) return `${months[idx]} ${match[1]}`;
  }
  return val;
}

function parseRunDate(val: string | null): number {
  if (!val) return 0;
  const monthMap: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const m1 = val.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m1) return parseInt(m1[2]) * 100 + (monthMap[m1[1].toLowerCase().slice(0, 3)] || 0);
  const m2 = val.match(/^(\d{4})-(\d{2})$/);
  if (m2) return parseInt(m2[1]) * 100 + parseInt(m2[2]);
  return 0;
}

type SortKey = "client" | "first_run" | "last_run";
type SortDir = "asc" | "desc";

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const { data: allItems = [], isLoading } = useCatalog(undefined, true);
  const updateItem = useUpdateCatalogItem();
  const deleteItem = useDeleteCatalogItem();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState({
    product_name: "", size: "", component: "", material: "",
    container_color: "", num_colors: "", print_colors: "",
    first_run: "", last_run: "",
  });
  const [sortKey, setSortKey] = useState<SortKey>("client");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Artwork upload
  const [uploading, setUploading] = useState(false);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const productId = searchParams.get("product");
    if (productId && allItems.length > 0) {
      const item = allItems.find(i => i.id === productId);
      if (item) {
        if (item.archived) setActiveTab("archived");
        openEdit(item);
        setSearchParams({}, { replace: true });
      }
    }
  }, [allItems, searchParams]);

  const activeItems = allItems.filter(i => !i.archived);
  const archivedItems = allItems.filter(i => i.archived);
  const tabItems = activeTab === "active" ? activeItems : archivedItems;

  const sorted = useMemo(() => {
    const items = [...tabItems];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "client") {
        cmp = (a.clients?.company || "").toLowerCase().localeCompare((b.clients?.company || "").toLowerCase());
        if (cmp === 0) cmp = a.product_name.toLowerCase().localeCompare(b.product_name.toLowerCase());
      } else if (sortKey === "first_run") cmp = parseRunDate(a.first_run) - parseRunDate(b.first_run);
      else if (sortKey === "last_run") cmp = parseRunDate(a.last_run) - parseRunDate(b.last_run);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [tabItems, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "client" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />;
  };

  const openEdit = (item: CatalogItem) => {
    setEditItem(item);
    setArtworkUrl((item as any).artwork_url || null);
    setEditForm({
      product_name: item.product_name || "", size: item.size || "", component: item.component || "",
      material: item.material || "", container_color: item.container_color || "",
      num_colors: item.num_colors?.toString() || "", print_colors: item.print_colors || "",
      first_run: item.first_run || "", last_run: item.last_run || "",
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!editItem) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `catalog/${editItem.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("proofs").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("proofs").getPublicUrl(path);
      setArtworkUrl(publicUrl);
      await updateItem.mutateAsync({ id: editItem.id, artwork_url: publicUrl } as any);
      toast.success("Artwork uploaded");
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeArtwork = async () => {
    if (!editItem) return;
    setArtworkUrl(null);
    await updateItem.mutateAsync({ id: editItem.id, artwork_url: null } as any);
    toast.success("Artwork removed");
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await updateItem.mutateAsync({
      id: editItem.id, product_name: editForm.product_name,
      size: editForm.size || null, component: editForm.component || null,
      material: editForm.material || null, container_color: editForm.container_color || null,
      num_colors: editForm.num_colors ? parseInt(editForm.num_colors) : null,
      print_colors: editForm.print_colors || null,
      first_run: editForm.first_run || null, last_run: editForm.last_run || null,
    } as any);
    toast.success("Product updated");
    setEditItem(null);
  };

  const handleArchiveClick = (id: string, name: string, e: React.MouseEvent) => { e.stopPropagation(); setArchiveTarget({ id, name }); };
  const confirmArchive = async () => { if (!archiveTarget) return; await updateItem.mutateAsync({ id: archiveTarget.id, archived: true }); toast.success("Product archived"); setArchiveTarget(null); };
  const restoreItem = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); await updateItem.mutateAsync({ id, archived: false }); toast.success("Product restored"); };
  const confirmDeleteItem = async () => { if (!deleteTarget) return; await deleteItem.mutateAsync(deleteTarget.id); toast.success("Catalog item deleted"); setDeleteTarget(null); };

  const exportToExcel = () => {
    const headers = ["Client","Product","Size","Component","Material","Container Color","# Colors","PMS Colors","First Run","Last Run"];
    const rows = sorted.map(i => [i.clients?.company, i.product_name, i.size, i.component, i.material, i.container_color, i.num_colors, i.print_colors, i.first_run, formatLastRun(i.last_run)]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "product_catalog.csv"; a.click();
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Product Catalog</h1>
        <Button variant="outline" onClick={exportToExcel}>Export to Excel</Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["active", "archived"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[9px] transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {tab === "active" ? `Active (${activeItems.length})` : `Archived (${archivedItems.length})`}
          </button>
        ))}
      </div>

      <div className="floating-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b bg-surface-header">
                <th className="text-left p-3 font-semibold text-xs cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("client")}>Client<SortIcon col="client" /></th>
                <th className="text-left p-3 font-semibold text-xs">Product</th>
                <th className="text-left p-3 font-semibold text-xs">Size</th>
                <th className="text-left p-3 font-semibold text-xs">Component</th>
                <th className="text-left p-3 font-semibold text-xs">Material</th>
                <th className="text-left p-3 font-semibold text-xs">Color</th>
                <th className="text-left p-3 font-semibold text-xs"># Colors</th>
                <th className="text-left p-3 font-semibold text-xs">PMS Colors</th>
                <th className="text-left p-3 font-semibold text-xs cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("first_run")}>First Run<SortIcon col="first_run" /></th>
                <th className="text-left p-3 font-semibold text-xs cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("last_run")}>Last Run<SortIcon col="last_run" /></th>
                <th className="text-left p-3 font-semibold text-xs w-8">📎</th>
                <th className="text-left p-3 font-semibold text-xs"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => (
                <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(item)}>
                  <td className="p-3">{item.clients?.company}</td>
                  <td className="p-3 font-medium">{item.product_name}</td>
                  <td className="p-3">{item.size}</td>
                  <td className="p-3">{item.component}</td>
                  <td className="p-3">{item.material}</td>
                  <td className="p-3">{item.container_color}</td>
                  <td className="p-3">{item.num_colors}</td>
                  <td className="p-3">{item.print_colors}</td>
                  <td className="p-3">{item.first_run || "—"}</td>
                  <td className="p-3">{formatLastRun(item.last_run)}</td>
                  <td className="p-3">{(item as any).artwork_url && <Paperclip size={14} className="text-primary" />}</td>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {activeTab === "active" && <button onClick={(e) => handleArchiveClick(item.id, item.product_name, e)} className="text-muted-foreground hover:text-foreground" title="Archive"><Archive size={14} /></button>}
                      {activeTab === "archived" && <button onClick={(e) => restoreItem(item.id, e)} className="text-muted-foreground hover:text-foreground" title="Restore"><RotateCcw size={14} /></button>}
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: item.id, name: item.product_name }); }} className="text-muted-foreground hover:text-destructive" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">No catalog items</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Catalog Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="font-semibold">Product Name</Label><Input value={editForm.product_name} onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="font-semibold">Size</Label><Input value={editForm.size} onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))} /></div>
              <div><Label className="font-semibold">Component</Label><Input value={editForm.component} onChange={e => setEditForm(f => ({ ...f, component: e.target.value }))} /></div>
              <div><Label className="font-semibold">Material</Label><Input value={editForm.material} onChange={e => setEditForm(f => ({ ...f, material: e.target.value }))} /></div>
              <div><Label className="font-semibold">Container Color</Label><Input value={editForm.container_color} onChange={e => setEditForm(f => ({ ...f, container_color: e.target.value }))} /></div>
              <div><Label className="font-semibold"># Colors</Label><Input type="number" value={editForm.num_colors} onChange={e => setEditForm(f => ({ ...f, num_colors: e.target.value }))} /></div>
              <div><Label className="font-semibold">Print Colors</Label><Input value={editForm.print_colors} onChange={e => setEditForm(f => ({ ...f, print_colors: e.target.value }))} /></div>
              <div><Label className="font-semibold">First Run</Label><Input value={editForm.first_run} onChange={e => setEditForm(f => ({ ...f, first_run: e.target.value }))} placeholder="e.g. Jan 2022" /></div>
              <div><Label className="font-semibold">Last Run</Label><Input value={editForm.last_run} onChange={e => setEditForm(f => ({ ...f, last_run: e.target.value }))} placeholder="e.g. Mar 2024" /></div>
            </div>

            {/* Artwork section */}
            <div>
              <Label className="font-semibold">Artwork / File</Label>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.ai,.eps,.svg"
                onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />

              {artworkUrl ? (
                <div className="mt-2 space-y-2">
                  <div className="border rounded-[9px] p-3 bg-background">
                    {isImage(artworkUrl) ? (
                      <img src={artworkUrl} alt="Artwork" className="max-h-40 rounded object-contain mx-auto" />
                    ) : (
                      <div className="flex items-center gap-2 text-sm"><Paperclip size={16} className="text-primary" /><span className="truncate">{artworkUrl.split('/').pop()}</span></div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(artworkUrl, '_blank')} className="gap-1.5 rounded-[9px]"><ExternalLink size={12} />View</Button>
                    <Button variant="outline" size="sm" asChild className="gap-1.5 rounded-[9px]"><a href={artworkUrl} download><Download size={12} />Download</a></Button>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 rounded-[9px]"><Upload size={12} />Replace</Button>
                    <Button variant="ghost" size="sm" onClick={removeArtwork} className="gap-1.5 text-destructive rounded-[9px]"><X size={12} />Remove</Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`mt-2 border-2 border-dashed rounded-[9px] p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]); }}
                >
                  <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">{uploading ? 'Uploading...' : 'Drop file here or click to browse'}</p>
                  <p className="text-[10px] text-text-light mt-1">Images, PDFs, AI, EPS, SVG</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive Product</AlertDialogTitle><AlertDialogDescription>Archive "{archiveTarget?.name}"? It will be moved to the Archived tab.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Catalog Item</AlertDialogTitle><AlertDialogDescription>Permanently delete "{deleteTarget?.name}"? This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
