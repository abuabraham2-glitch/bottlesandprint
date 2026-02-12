import { useState } from "react";
import { useClients, useCreateClient, useUpdateClient, useOrders } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, Archive, CheckCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Clients() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: clients = [], isLoading } = useClients(showArchived);
  const { data: orders = [] } = useOrders();
  const updateClient = useUpdateClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const archiveClient = async (id: string) => {
    if (!confirm("Archive this client?")) return;
    await updateClient.mutateAsync({ id, archived: true });
    toast.success("Client archived");
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus size={16} className="mr-2" /> New Client</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
              <NewClientForm onSuccess={() => { setDialogOpen(false); toast.success("Client created"); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(client => {
          const activeOrders = orders.filter(o => o.client_id === client.id && !o.archived).length;
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
                {!client.archived && (
                  <button onClick={e => { e.stopPropagation(); archiveClient(client.id); }} className="text-muted-foreground hover:text-foreground p-1">
                    <Archive size={16} />
                  </button>
                )}
              </div>
              {client.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
              {client.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
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
    </div>
  );
}

function NewClientForm({ onSuccess }: { onSuccess: () => void }) {
  const createClient = useCreateClient();
  const [form, setForm] = useState({
    company: "", contact_name: "", email: "", phone: "", address: "", billing_address: "", form_signed: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company) return;
    await createClient.mutateAsync(form);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><Label>Company *</Label><Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} required /></div>
      <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
      <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
      <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
      <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
      <div><Label>Billing Address</Label><Input value={form.billing_address} onChange={e => setForm(p => ({ ...p, billing_address: e.target.value }))} /></div>
      <label className="flex items-center gap-2">
        <Checkbox checked={form.form_signed} onCheckedChange={v => setForm(p => ({ ...p, form_signed: !!v }))} />
        <span className="text-sm">Form Signed</span>
      </label>
      <Button type="submit" disabled={createClient.isPending} className="w-full">
        {createClient.isPending ? "Creating..." : "Add Client"}
      </Button>
    </form>
  );
}
