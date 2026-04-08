import { useState, useRef, useCallback } from "react";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, useOrders } from "@/lib/data";
import { formatAddress } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Archive, CheckCircle, XCircle, Trash2, RotateCcw, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AddressFields from "@/components/AddressFields";
import { syncClientToQB } from "@/lib/quickbooks";
import { supabase } from "@/integrations/supabase/client";

export default function Clients() {
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const { data: allClients = [], isLoading } = useClients(true); // fetch all
  const { data: orders = [] } = useOrders();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; company: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; company: string } | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const navigate = useNavigate();

  const activeClients = allClients.filter(c => !c.archived);
  const archivedClients = allClients.filter(c => c.archived);
  const clients = activeTab === "active" ? activeClients : archivedClients;

  const handleArchiveClick = (id: string, company: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const activeOrders = orders.filter(o => o.client_id === id && !o.archived);
    if (activeOrders.length > 0) {
      setArchiveError("This client has active orders and cannot be archived. Archive the orders first.");
      setArchiveTarget({ id, company });
    } else {
      setArchiveError(null);
      setArchiveTarget({ id, company });
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget || archiveError) { setArchiveTarget(null); setArchiveError(null); return; }
    await updateClient.mutateAsync({ id: archiveTarget.id, archived: true });
    toast.success("Client archived");
    setArchiveTarget(null);
  };

  const restoreClient = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateClient.mutateAsync({ id, archived: false });
    toast.success("Client restored");
  };

  const handleDeleteClick = (id: string, company: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const activeOrders = orders.filter(o => o.client_id === id && !o.archived);
    if (activeOrders.length > 0) {
      setDeleteError("This client has active orders and cannot be deleted. Archive them first.");
      setDeleteTarget({ id, company });
    } else {
      setDeleteError(null);
      setDeleteTarget({ id, company });
    }
  };

  const confirmDeleteClient = async () => {
    if (!deleteTarget || deleteError) { setDeleteTarget(null); setDeleteError(null); return; }
    await deleteClient.mutateAsync(deleteTarget.id);
    toast.success("Client deleted");
    setDeleteTarget(null);
  };

  const exportClients = () => {
    const headers = ["Company", "Contact Name", "Email", "Phone", "Street Address", "City", "State", "Zip", "Billing Street", "Billing City", "Billing State", "Billing Zip", "Form Signed"];
    const rows = clients.map(c => [
      c.company, c.contact_name, c.email, c.phone, c.street_address, c.city, c.state, c.zip,
      c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.form_signed ? "Yes" : "No"
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clients.csv";
    a.click();
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={exportClients}>Export to Excel</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus size={16} className="mr-2" /> New Client</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
              <ClientForm onSuccess={() => { setDialogOpen(false); toast.success("Client created"); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Active / Archived tabs */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-3 py-2 text-xs font-medium rounded-md transition-colors min-h-[44px] ${
            activeTab === "active"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Active ({activeClients.length})
        </button>
        <button
          onClick={() => setActiveTab("archived")}
          className={`px-3 py-2 text-xs font-medium rounded-md transition-colors min-h-[44px] ${
            activeTab === "archived"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Archived ({archivedClients.length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(client => {
          const activeOrders = orders.filter(o => o.client_id === client.id && !o.archived).length;
          const addr = formatAddress(client.street_address, client.city, client.state, client.zip);
          return (
            <div
              key={client.id}
              className="bg-card rounded-lg border p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/clients/${client.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{client.company}</h3>
                  {client.contact_name && <p className="text-sm text-muted-foreground">{client.contact_name}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {activeTab === "active" && (
                    <button onClick={e => handleArchiveClick(client.id, client.company, e)} className="text-muted-foreground hover:text-foreground p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Archive">
                      <Archive size={16} />
                    </button>
                  )}
                  {activeTab === "archived" && (
                    <button onClick={e => restoreClient(client.id, e)} className="text-muted-foreground hover:text-foreground p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Restore">
                      <RotateCcw size={16} />
                    </button>
                  )}
                  <button onClick={e => handleDeleteClick(client.id, client.company, e)} className="text-muted-foreground hover:text-destructive p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {client.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
              {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
              {addr && <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">{addr}</p>}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">{activeOrders} active order{activeOrders !== 1 ? "s" : ""}</span>
                <span className="flex items-center gap-1 text-xs">
                  {client.form_signed ? (
                    <><CheckCircle size={12} className="text-green-600" /> Form signed</>
                  ) : (
                    <><XCircle size={12} className="text-muted-foreground" /> Form not signed</>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        {clients.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">No clients found</div>
        )}
      </div>

      {/* Archive Client Confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) { setArchiveTarget(null); setArchiveError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveError ? "Cannot Archive Client" : "Archive Client"}</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveError || `Archive "${archiveTarget?.company}"? They will be moved to the Archived tab.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!archiveError && (
              <AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Client Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteError ? "Cannot Delete Client" : "Delete Client"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError || `Are you sure you want to permanently delete "${deleteTarget?.company}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction onClick={confirmDeleteClient} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ClientForm({ onSuccess, initialData }: { onSuccess: () => void; initialData?: any }) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = !!initialData;
  const [syncPromptOpen, setSyncPromptOpen] = useState(false);
  const [savedClient, setSavedClient] = useState<any>(null);
  const [form, setForm] = useState({
    company: initialData?.company || "",
    contact_name: initialData?.contact_name || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    street_address: initialData?.street_address || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    zip: initialData?.zip || "",
    billing_street: initialData?.billing_street || "",
    billing_city: initialData?.billing_city || "",
    billing_state: initialData?.billing_state || "",
    billing_zip: initialData?.billing_zip || "",
    form_signed: initialData?.form_signed || false,
  });

  // Document upload state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docStatus, setDocStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [docError, setDocError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];

  const processFile = useCallback(async (file: File) => {
    // Check for .docx
    if (file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      setDocFile(file);
      setDocStatus("error");
      setDocError("Please use a PDF or image of the form for best results");
      return;
    }

    const mediaType = file.type || "application/pdf";
    if (!ACCEPTED_TYPES.includes(mediaType)) {
      setDocStatus("error");
      setDocError("Unsupported file type. Use PDF, JPG, or PNG.");
      return;
    }

    setDocFile(file);
    setDocStatus("loading");
    setDocError("");

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-client-form", {
        body: { base64Data: base64, mediaType },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted = data.extracted;
      if (!extracted || typeof extracted !== "object") throw new Error("Invalid response");

      // Auto-fill form fields (only non-empty extracted values)
      setForm(prev => ({
        ...prev,
        company: extracted.company || prev.company,
        contact_name: extracted.contact_name || prev.contact_name,
        email: extracted.email || prev.email,
        phone: extracted.phone || prev.phone,
        street_address: extracted.street_address || prev.street_address,
        city: extracted.city || prev.city,
        state: extracted.state || prev.state,
        zip: extracted.zip || prev.zip,
        billing_street: extracted.billing_street || prev.billing_street,
        billing_city: extracted.billing_city || prev.billing_city,
        billing_state: extracted.billing_state || prev.billing_state,
        billing_zip: extracted.billing_zip || prev.billing_zip,
        form_signed: true,
      }));

      setDocStatus("success");
    } catch (err: any) {
      console.error("Document extraction failed:", err);
      setDocStatus("error");
      setDocError("Couldn't read document — please fill in manually");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company) return;

    let clientId: string | undefined;

    if (isEdit) {
      await updateClient.mutateAsync({ id: initialData.id, ...form });
      clientId = initialData.id;
    } else {
      const created = await createClient.mutateAsync(form);
      clientId = created?.id;
    }

    // Upload the document to storage if we have one
    if (docFile && clientId) {
      try {
        const filePath = `${clientId}/${Date.now()}_${docFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("client-documents")
          .upload(filePath, docFile);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("client-documents")
            .getPublicUrl(filePath);
          await supabase.from("client_documents").insert({
            client_id: clientId,
            file_name: docFile.name,
            file_type: docFile.type || "application/octet-stream",
            file_url: publicUrl,
          });
        }
      } catch (err) {
        console.error("Failed to upload document to storage:", err);
      }
    }

    setSavedClient(form);
    setSyncPromptOpen(true);
  };

  const handleSyncResponse = async (sync: boolean) => {
    setSyncPromptOpen(false);
    if (sync && savedClient) {
      await syncClientToQB(savedClient);
    }
    onSuccess();
  };

  const updateField = (key: string, val: string | boolean) => setForm(p => ({ ...p, [key]: val }));

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Document Drop Zone */}
        {!isEdit && (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => docStatus !== "loading" && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : docStatus === "success"
                ? "border-green-500/50 bg-green-50 dark:bg-green-950/20"
                : docStatus === "error"
                ? "border-destructive/50 bg-destructive/5"
                : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              className="hidden"
              onChange={handleFileSelect}
            />
            {docStatus === "idle" && (
              <div className="flex flex-col items-center gap-1.5 py-1">
                <FileText size={20} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Drop new client form here to auto-fill</span>
              </div>
            )}
            {docStatus === "loading" && (
              <div className="flex items-center justify-center gap-2 py-1">
                <Loader2 size={18} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Reading document…</span>
              </div>
            )}
            {docStatus === "success" && (
              <div className="flex items-center justify-center gap-2 py-1">
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">{docFile?.name}</span>
              </div>
            )}
            {docStatus === "error" && (
              <div className="flex items-center justify-center gap-2 py-1">
                <AlertCircle size={18} className="text-destructive" />
                <span className="text-sm text-destructive">{docError}</span>
              </div>
            )}
          </div>
        )}

        <div><Label>Company *</Label><Input value={form.company} onChange={e => updateField("company", e.target.value)} required /></div>
        <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => updateField("contact_name", e.target.value)} /></div>
        <div><Label>Email</Label><Input type="text" value={form.email} onChange={e => updateField("email", e.target.value)} placeholder="e.g. john@co.com, jane@co.com" className="w-full" /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={e => updateField("phone", e.target.value)} /></div>

        <AddressFields
          label="Mailing Address"
          street={form.street_address}
          city={form.city}
          state={form.state}
          zip={form.zip}
          onChange={(f, v) => updateField(f, v)}
          streetField="street_address"
          cityField="city"
          stateField="state"
          zipField="zip"
        />

        <AddressFields
          label="Billing Address"
          street={form.billing_street}
          city={form.billing_city}
          state={form.billing_state}
          zip={form.billing_zip}
          onChange={(f, v) => updateField(f, v)}
          streetField="billing_street"
          cityField="billing_city"
          stateField="billing_state"
          zipField="billing_zip"
        />

        <label className="flex items-center gap-2">
          <Checkbox checked={form.form_signed} onCheckedChange={v => updateField("form_signed", !!v)} />
          <span className="text-sm">Form Signed</span>
        </label>
        <Button type="submit" disabled={createClient.isPending || updateClient.isPending} className="w-full">
          {isEdit ? "Save Changes" : (createClient.isPending ? "Creating..." : "Add Client")}
        </Button>
      </form>

      <AlertDialog open={syncPromptOpen} onOpenChange={setSyncPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync to QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to sync this client to QuickBooks?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleSyncResponse(false)}>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSyncResponse(true)}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
