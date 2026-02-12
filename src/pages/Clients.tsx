import { useState } from "react";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, useOrders } from "@/lib/data";
import { formatAddress } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, Archive, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AddressFields from "@/components/AddressFields";

export default function Clients() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: clients = [], isLoading } = useClients(showArchived);
  const { data: orders = [] } = useOrders();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; company: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigate = useNavigate();

  const archiveClient = async (id: string) => {
    if (!confirm("Archive this client?")) return;
    await updateClient.mutateAsync({ id, archived: true });
    toast.success("Client archived");
  };

  const handleDeleteClick = (id: string, company: string) => {
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
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Show Archived
          </label>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(client => {
          const activeOrders = orders.filter(o => o.client_id === client.id && !o.archived).length;
          const addr = formatAddress(client.street_address, client.city, client.state, client.zip);
          return (
            <div
              key={client.id}
              className={`bg-card rounded-lg border p-5 cursor-pointer hover:shadow-md transition-shadow ${client.archived ? "opacity-60" : ""}`}
              onClick={() => navigate(`/clients/${client.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{client.company}</h3>
                  {client.contact_name && <p className="text-sm text-muted-foreground">{client.contact_name}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {!client.archived && (
                    <button onClick={e => { e.stopPropagation(); archiveClient(client.id); }} className="text-muted-foreground hover:text-foreground p-1" title="Archive">
                      <Archive size={16} />
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); handleDeleteClick(client.id, client.company); }} className="text-muted-foreground hover:text-destructive p-1" title="Delete">
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company) return;
    if (isEdit) {
      await updateClient.mutateAsync({ id: initialData.id, ...form });
    } else {
      await createClient.mutateAsync(form);
    }
    onSuccess();
  };

  const updateField = (key: string, val: string | boolean) => setForm(p => ({ ...p, [key]: val }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><Label>Company *</Label><Input value={form.company} onChange={e => updateField("company", e.target.value)} required /></div>
      <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => updateField("contact_name", e.target.value)} /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => updateField("email", e.target.value)} /></div>
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
  );
}
