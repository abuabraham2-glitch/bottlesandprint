import { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useClient, useOrders, useCatalog, useDeleteClient, useClientDocuments, useUploadClientDocument, useDeleteClientDocument } from "@/lib/data";
import { getStageBadgeClass, getStageLabel, formatAddress, formatDateShort } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle, XCircle, Pencil, Trash2, RefreshCw, Upload, FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ClientForm } from "./Clients";
import { syncClientToQB } from "@/lib/quickbooks";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClient(id!);
  const { data: orders = [] } = useOrders(true);
  const { data: catalog = [] } = useCatalog(id);
  const { data: clientDocs = [] } = useClientDocuments(id!);
  const deleteClient = useDeleteClient();
  const uploadClientDoc = useUploadClientDocument();
  const deleteClientDoc = useDeleteClientDocument();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ id: string; fileUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientOrders = orders.filter(o => o.client_id === id);

  if (isLoading || !client) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const addr = formatAddress(client.street_address, client.city, client.state, client.zip);
  const billingAddr = formatAddress(client.billing_street, client.billing_city, client.billing_state, client.billing_zip);

  const handleDeleteClick = () => {
    const activeOrders = orders.filter(o => o.client_id === id && !o.archived);
    if (activeOrders.length > 0) {
      setDeleteError("This client has active orders and cannot be deleted. Archive them first.");
    } else {
      setDeleteError(null);
    }
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteError) { setDeleteOpen(false); return; }
    await deleteClient.mutateAsync(id!);
    toast.success("Client deleted");
    navigate("/clients");
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !id) return;
    for (const file of Array.from(files)) {
      await uploadClientDoc.mutateAsync({ clientId: id, file });
    }
    toast.success("Document uploaded");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  };

  const confirmDeleteDoc = async () => {
    if (deleteDocTarget && id) {
      await deleteClientDoc.mutateAsync({ id: deleteDocTarget.id, clientId: id, fileUrl: deleteDocTarget.fileUrl });
      toast.success("Document deleted");
    }
    setDeleteDocTarget(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /></Button>
        <h1 className="text-2xl font-bold">{client.company}</h1>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil size={14} className="mr-1" /> Edit</Button>
        <Button variant="outline" size="sm" onClick={handleDeleteClick} className="text-destructive hover:text-destructive"><Trash2 size={14} className="mr-1" /> Delete</Button>
        <Button variant="outline" size="sm" onClick={() => syncClientToQB(client)}><RefreshCw size={14} className="mr-1" /> Sync to QuickBooks</Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-3">Contact Info</h3>
          <div className="space-y-2 text-sm">
            <Row label="Contact" value={client.contact_name} />
            <Row label="Email" value={client.email} />
            <Row label="Phone" value={client.phone} />
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right whitespace-pre-line">{addr || "—"}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">Billing</span>
              <span className="text-right whitespace-pre-line">{billingAddr || "—"}</span>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-3">Status</h3>
          <div className="flex items-center gap-2 text-sm mb-2">
            {client.form_signed ? (
              <><CheckCircle size={16} className="text-green-600" /> Client form signed</>
            ) : (
              <><XCircle size={16} className="text-destructive" /> Client form not signed</>
            )}
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="bg-card rounded-lg border p-5">
        <h3 className="font-semibold mb-4">Documents</h3>
        {clientDocs.length > 0 && (
          <div className="space-y-2 mb-4">
            {clientDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                <FileText size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{doc.file_name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{doc.uploaded_at ? formatDateShort(doc.uploaded_at) : "—"}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground p-1" title="Open">
                    <ExternalLink size={15} />
                  </a>
                  <button onClick={() => setDeleteDocTarget({ id: doc.id, fileUrl: doc.file_url })} className="text-muted-foreground hover:text-destructive p-1" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drop files here or click to upload</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, Word docs, and more</p>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { handleFileUpload(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ""; }} />
        </div>
      </div>

      {/* Catalog */}
      {catalog.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Product Catalog</h3>
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Component</th>
                <th className="text-left p-3 font-medium">Material</th>
                <th className="text-left p-3 font-medium">Colors</th>
                <th className="text-left p-3 font-medium">Last Run</th>
              </tr></thead>
              <tbody>
                {catalog.map(item => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="p-3 font-medium">{item.product_name}</td>
                    <td className="p-3">{item.size}</td>
                    <td className="p-3">{item.component}</td>
                    <td className="p-3">{item.material}</td>
                    <td className="p-3">{item.print_colors}</td>
                    <td className="p-3">{item.last_run || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders */}
      <div>
        <h3 className="font-semibold mb-3">Order History ({clientOrders.length})</h3>
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Item</th>
              <th className="text-left p-3 font-medium">Size</th>
              <th className="text-left p-3 font-medium">Qty</th>
              <th className="text-left p-3 font-medium">Stage</th>
              <th className="text-left p-3 font-medium">Due</th>
            </tr></thead>
            <tbody>
              {clientOrders.map(order => (
                <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                  <td className="p-3 font-medium">{order.item_name}</td>
                  <td className="p-3">{order.bottle_size}</td>
                  <td className="p-3">{order.quantity?.toLocaleString()}</td>
                  <td className="p-3"><Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>{getStageLabel(order.stage)}</Badge></td>
                  <td className="p-3">{formatDateShort(order.due_date)}</td>
                </tr>
              ))}
              {clientOrders.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          <ClientForm initialData={client} onSuccess={() => { setEditOpen(false); toast.success("Client updated"); }} />
        </DialogContent>
      </Dialog>

      {/* Delete Client Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteError ? "Cannot Delete Client" : "Delete Client"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError || `Are you sure you want to permanently delete "${client.company}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Document Dialog */}
      <AlertDialog open={!!deleteDocTarget} onOpenChange={(open) => { if (!open) setDeleteDocTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this document? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDoc} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}
