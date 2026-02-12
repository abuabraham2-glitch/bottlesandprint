import { useParams, useNavigate } from "react-router-dom";
import { useOrder, useUpdateOrder, useOrderDocuments, useUploadDocument, useArchiveOrder } from "@/lib/data";
import { STAGES, checklistCount, daysUntilDue, generateInvoiceNumber, DOC_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, Eye, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { useState, useCallback, useRef } from "react";

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading } = useOrder(id!);
  const { data: documents = [] } = useOrderDocuments(id!);
  const updateOrder = useUpdateOrder();
  const uploadDoc = useUploadDocument();
  const archiveOrder = useArchiveOrder();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState("Other");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(async (updates: Record<string, any>) => {
    if (!id) return;
    await updateOrder.mutateAsync({ id, ...updates } as any);
  }, [id, updateOrder]);

  if (isLoading || !order) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const stageIndex = STAGES.findIndex(s => s.key === order.stage);
  const checked = checklistCount(order);
  const allChecked = checked === 6;
  const days = daysUntilDue(order.due_date);

  const moveStage = async (newStage: string) => {
    await update({ stage: newStage });
    toast.success(`Order moved to ${STAGES.find(s => s.key === newStage)?.label}`);
  };

  const createInvoice = async () => {
    const num = generateInvoiceNumber();
    await update({ invoiced: true, invoice_num: num });
    toast.success(`Invoice ${num} created`);
  };

  const recordPayment = async (method: string) => {
    const payMethod = method === "Check" ? prompt("Enter check number:") || "Check" : "ACH";
    await update({ paid: true, pay_method: payMethod, pay_date: new Date().toISOString().split("T")[0] });
    toast.success("Payment recorded");
  };

  const handleArchive = async () => {
    if (!confirm("Archive this order? It will be moved to completed data.")) return;
    await archiveOrder.mutateAsync(order);
    toast.success("Order archived");
    navigate("/orders");
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !id) return;
    for (const file of Array.from(files)) {
      await uploadDoc.mutateAsync({ orderId: id, file, fileType: uploadType });
    }
    toast.success("Document uploaded");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  };

  const checklistItems = [
    { key: "checklist_new_client_form", label: "New Client Form" },
    { key: "checklist_artwork_in", label: "Artwork In" },
    { key: "checklist_proof_approved", label: "Proof Approved" },
    { key: "checklist_purchase_order", label: "Purchase Order" },
    { key: "checklist_bottles", label: "Bottles" },
    { key: "checklist_art_order_logged", label: "New Art / Order Logged" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /></Button>
        <div>
          <h1 className="text-2xl font-bold">{order.item_name}</h1>
          <p className="text-muted-foreground">{order.clients?.company}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-card rounded-lg border p-6">
        <div className="flex items-center justify-between">
          {STAGES.map((stage, i) => (
            <div key={stage.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i < stageIndex ? "bg-success text-success-foreground" :
                  i === stageIndex ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i < stageIndex ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-xs mt-1 ${i === stageIndex ? "font-semibold" : "text-muted-foreground"}`}>
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < stageIndex ? "bg-success" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-primary/10 rounded-lg border border-primary/20 p-4 flex flex-wrap items-center gap-3">
        {order.stage === "preflight" && (
          <>
            {allChecked ? (
              <Button onClick={() => moveStage("wip")}>Move to W.I.P.</Button>
            ) : (
              <span className="text-sm text-muted-foreground">Complete all 6 checklist items to proceed ({checked}/6 done)</span>
            )}
          </>
        )}
        {order.stage === "wip" && (
          <Button onClick={() => moveStage("completed")}>Mark Completed</Button>
        )}
        {order.stage === "completed" && (
          <>
            {!order.invoiced ? (
              <Button onClick={createInvoice}>Create Invoice</Button>
            ) : (
              <Button onClick={() => moveStage("to_ship")}>Move to Ship</Button>
            )}
          </>
        )}
        {order.stage === "to_ship" && (
          <>
            {!order.outgoing_bol && (
              <Button onClick={async () => {
                const bol = prompt("Enter BOL number:");
                if (bol) { await update({ outgoing_bol: bol }); toast.success("BOL number saved"); }
              }}>Generate BOL</Button>
            )}
            {order.outgoing_bol && !order.bol_signed && (
              <Button onClick={async () => { await update({ bol_signed: true }); toast.success("BOL marked as signed"); }}>
                Mark BOL Signed
              </Button>
            )}
            {order.bol_signed && (
              <Button onClick={() => { update({ shipped: true, ship_date: new Date().toISOString().split("T")[0] }); moveStage("close"); }}>
                Move to Close
              </Button>
            )}
          </>
        )}
        {order.stage === "close" && (
          <>
            {!order.paid ? (
              <>
                <Button onClick={() => recordPayment("ACH")}>Payment: ACH</Button>
                <Button variant="outline" onClick={() => recordPayment("Check")}>Payment: Check</Button>
              </>
            ) : (
              <Button onClick={handleArchive}>Archive & Close Order</Button>
            )}
          </>
        )}
        {/* Invoice Early button for preflight/wip */}
        {(order.stage === "preflight" || order.stage === "wip") && !order.invoiced && (
          <Button variant="outline" onClick={createInvoice} className="ml-auto">Invoice Early</Button>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Checklist */}
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Pre-Flight Checklist</h3>
          <div className="space-y-3">
            {checklistItems.map(item => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={(order as any)[item.key]}
                  onCheckedChange={(val) => update({ [item.key]: val })}
                />
                <span className="text-sm">{item.label}</span>
              </label>
            ))}
          </div>
          <div className={`mt-4 p-2 rounded text-sm text-center font-medium ${allChecked ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            {allChecked ? "✓ All clear" : `⏳ ${6 - checked} item(s) needed`}
          </div>
        </div>

        {/* Order Details */}
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Order Details</h3>
          <div className="space-y-2 text-sm">
            <Detail label="Container" value={[order.bottle_size, order.bottle_type, order.material, order.bottle_color].filter(Boolean).join(" · ")} />
            <Detail label="Print" value={[order.num_colors ? `${order.num_colors} color(s)` : null, order.print_colors].filter(Boolean).join(" · ")} />
            <Detail label="Quantity" value={order.quantity?.toLocaleString()} />
            <Detail label="Packing" value={order.packing} />
            <Detail label="Date Entered" value={order.date_entered} />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Due Date</span>
              <Input
                type="date"
                value={order.due_date || ""}
                onChange={e => update({ due_date: e.target.value })}
                className="w-40 h-8 text-sm"
              />
            </div>
            {days !== null && (
              <Detail
                label="Status"
                value={days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`}
                className={days < 0 ? "text-destructive font-medium" : days < 7 ? "text-warning font-medium" : ""}
              />
            )}
          </div>
        </div>
      </div>

      {/* PO/Invoice + Shipping */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">PO & Invoice</h3>
          <div className="space-y-2 text-sm">
            <Detail label="Client PO" value={order.client_po} />
            <Detail label="Vendor PO" value={order.vendor_po || "—"} />
            <Detail label="Invoiced" value={order.invoiced ? `Yes — ${order.invoice_num}` : "No"} />
            <Detail label="Paid" value={order.paid ? `${order.pay_method} on ${order.pay_date}` : "No"} />
          </div>
        </div>
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Shipping</h3>
          <div className="space-y-2 text-sm">
            <Detail label="Shipped" value={order.shipped ? `Yes — ${order.ship_date}` : "No"} />
            <Detail label="Outgoing BOL" value={order.outgoing_bol || "—"} />
            <Detail label="BOL Signed" value={order.bol_signed ? "Yes" : "No"} />
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="bg-card rounded-lg border p-5">
        <h3 className="font-semibold mb-4">Documents</h3>
        {documents.length > 0 && (
          <div className="space-y-2 mb-4">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                <FileText size={16} className="text-muted-foreground" />
                <span className="text-sm flex-1">{doc.file_name}</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded">{doc.file_type}</span>
                <button onClick={() => setPreviewUrl(doc.file_url)} className="text-muted-foreground hover:text-foreground">
                  <Eye size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mb-3">
          <Select value={uploadType} onValueChange={setUploadType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drag & drop files here — PNG, JPG, Word, PDF</p>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFileUpload(e.target.files)} />
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-2">Notes</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
        </div>
      )}

      {/* Client Info */}
      {order.clients && (
        <details className="bg-card rounded-lg border p-5">
          <summary className="font-semibold cursor-pointer">Client Info</summary>
          <div className="mt-3 space-y-1 text-sm">
            <Detail label="Company" value={order.clients.company} />
            <Detail label="Contact" value={order.clients.contact_name} />
            <Detail label="Email" value={order.clients.email} />
            <Detail label="Phone" value={order.clients.phone} />
            <Detail label="Address" value={order.clients.address} />
          </div>
        </details>
      )}

      {/* Document Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Document Preview</DialogTitle></DialogHeader>
          {previewUrl && (
            previewUrl.match(/\.(pdf)$/i) ? (
              <iframe src={previewUrl} className="w-full h-[70vh]" />
            ) : (
              <img src={previewUrl} alt="Document" className="max-w-full max-h-[70vh] mx-auto" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={className}>{value || "—"}</span>
    </div>
  );
}
