import { useParams, useNavigate } from "react-router-dom";
import { useOrder, useUpdateOrder, useOrderDocuments, useUploadDocument, useArchiveOrder, useRenameDocument, useDeleteDocument, getNextBolNumber, updateCatalogLastRun } from "@/lib/data";
import { STAGES, checklistCount, daysUntilDue, daysSinceCreated, generateInvoiceNumber, DOC_TYPES, formatAddress, formatDateShort } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Check, Eye, Upload, FileText, Pencil, Trash2, Download, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useState, useCallback, useRef } from "react";
import { format, addWeeks } from "date-fns";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useOrder(id!);
  const { data: documents = [] } = useOrderDocuments(id!);
  const updateOrder = useUpdateOrder();
  const uploadDoc = useUploadDocument();
  const archiveOrder = useArchiveOrder();
  const renameDoc = useRenameDocument();
  const deleteDoc = useDeleteDocument();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState("Other");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; file_url: string } | null>(null);
  const [moveBackOpen, setMoveBackOpen] = useState(false);
  const [moveBackTarget, setMoveBackTarget] = useState("");
  const [achDialogOpen, setAchDialogOpen] = useState(false);
  const [achDate, setAchDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bolDialogOpen, setBolDialogOpen] = useState(false);
  const [bolCarrier, setBolCarrier] = useState("WILL CALL");

  const update = useCallback(async (updates: Record<string, any>) => {
    if (!id) return;
    await updateOrder.mutateAsync({ id, ...updates } as any);
  }, [id, updateOrder]);

  if (isLoading || !order) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const stageIndex = STAGES.findIndex(s => s.key === order.stage);
  const checked = checklistCount(order);
  const allChecked = checked === 6;
  const days = daysUntilDue(order.due_date);
  const daysInPreflight = daysSinceCreated(order.date_entered);

  const moveStage = async (newStage: string) => {
    const updates: Record<string, any> = { stage: newStage };
    // Auto-set due_date when moving to WIP
    if (newStage === "wip") {
      updates.due_date = format(addWeeks(new Date(), 4), "yyyy-MM-dd");
    }
    await update(updates);
    if (newStage === "completed") {
      await updateCatalogLastRun(order.client_id, order.item_name);
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    }
    toast.success(`Order moved to ${STAGES.find(s => s.key === newStage)?.label}`);
  };

  const createInvoice = async () => {
    const num = generateInvoiceNumber();
    await update({ invoiced: true, invoice_num: num });
    toast.success(`Invoice ${num} created`);
  };

  const handleAchPayment = async () => {
    await update({ paid: true, pay_method: "ACH", pay_date: achDate });
    setAchDialogOpen(false);
    toast.success("ACH payment recorded");
  };

  const handleCheckPayment = async () => {
    const method = checkNumber ? `Check #${checkNumber}` : "Check";
    await update({ paid: true, pay_method: method, pay_date: checkDate });
    setCheckDialogOpen(false);
    toast.success("Check payment recorded");
  };

  const handleArchive = async () => {
    if (!confirm("Archive this order? It will be moved to completed data.")) return;
    await archiveOrder.mutateAsync(order);
    toast.success("Order archived");
    navigate("/orders");
  };

  const convertImageToPdf = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const pdf = new jsPDF({
          orientation: img.width > img.height ? "landscape" : "portrait",
          unit: "px",
          format: [img.width, img.height],
        });
        pdf.addImage(img, "JPEG", 0, 0, img.width, img.height);
        const blob = pdf.output("blob");
        const pdfName = file.name.replace(/\.(jpg|jpeg|png)$/i, ".pdf");
        resolve(new File([blob], pdfName, { type: "application/pdf" }));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !id) return;
    for (let file of Array.from(files)) {
      if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
        file = await convertImageToPdf(file);
      }
      await uploadDoc.mutateAsync({ orderId: id, file, fileType: uploadType });
    }
    toast.success("Document uploaded");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  };

  const startRename = (doc: { id: string; file_name: string }) => {
    setRenamingId(doc.id);
    setRenameValue(doc.file_name);
  };

  const saveRename = async () => {
    if (renamingId && renameValue.trim() && id) {
      await renameDoc.mutateAsync({ id: renamingId, file_name: renameValue.trim(), orderId: id });
      toast.success("Document renamed");
    }
    setRenamingId(null);
  };

  const confirmDelete = async () => {
    if (deleteTarget && id) {
      await deleteDoc.mutateAsync({ id: deleteTarget.id, orderId: id, file_url: deleteTarget.file_url });
      toast.success("Document deleted");
    }
    setDeleteTarget(null);
  };

  const downloadFile = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleGenerateBol = async () => {
    if (!order || !id) return;
    const bolNum = await getNextBolNumber();

    const client = order.clients;
    const clientAddr = client ? formatAddress(client.street_address, client.city, client.state, client.zip) : "";

    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text("BILL OF LADING", 105, 20, { align: "center" });
    pdf.setFontSize(11);
    pdf.text(`BOL #: ${bolNum}`, 15, 35);
    pdf.text(`Date: ${formatDateShort(new Date().toISOString().split("T")[0])}`, 140, 35);
    pdf.setFontSize(10);
    pdf.text("SHIPPER:", 15, 50);
    pdf.setFontSize(9);
    pdf.text("BOTTLES AND PRINT", 15, 56);
    pdf.text("12990 BRANFORD ST, UNIT I", 15, 61);
    pdf.text("PACOIMA, CA 91331", 15, 66);
    pdf.text("Phone: 951-421-1881", 15, 71);
    pdf.text("Email: info@bottlesandprint.com", 15, 76);
    pdf.setFontSize(10);
    pdf.text("CONSIGNEE:", 110, 50);
    pdf.setFontSize(9);
    pdf.text(client?.company || "", 110, 56);
    if (client?.contact_name) pdf.text(client.contact_name, 110, 61);
    if (clientAddr) {
      const lines = clientAddr.split("\n");
      lines.forEach((line, i) => pdf.text(line, 110, 66 + i * 5));
    }
    pdf.setFontSize(10);
    pdf.text("DESCRIPTION:", 15, 90);
    pdf.setFontSize(9);
    const desc = [
      order.item_name,
      [order.bottle_size, order.bottle_type].filter(Boolean).join(" "),
      order.num_colors ? `${order.num_colors} color(s)` : null,
      order.packing,
      order.client_po ? `Client PO: ${order.client_po}` : null,
    ].filter(Boolean).join(" | ");
    pdf.text(desc, 15, 96, { maxWidth: 180 });
    pdf.setFontSize(10);
    pdf.text(`Carrier: ${bolCarrier}`, 15, 115);
    pdf.text("_________________________________", 15, 145);
    pdf.text("Shipper Signature", 15, 152);
    pdf.text("_________________________________", 110, 145);
    pdf.text("Carrier Signature", 110, 152);

    const pdfBlob = pdf.output("blob");
    const pdfFile = new File([pdfBlob], `BOL-${bolNum}.pdf`, { type: "application/pdf" });
    const filePath = `${id}/${Date.now()}_BOL-${bolNum}.pdf`;
    await supabase.storage.from("order-documents").upload(filePath, pdfFile);
    const { data: urlData } = supabase.storage.from("order-documents").getPublicUrl(filePath);
    await supabase.from("order_documents").insert({
      order_id: id,
      file_name: `BOL-${bolNum}.pdf`,
      file_type: "Signed BOL",
      file_url: urlData.publicUrl,
    });
    await update({ outgoing_bol: bolNum });
    queryClient.invalidateQueries({ queryKey: ["order_documents", id] });
    setBolDialogOpen(false);
    toast.success(`BOL #${bolNum} generated`);
  };

  const previousStages = STAGES.slice(0, stageIndex);

  const checklistItems = [
    { key: "checklist_new_client_form", label: "New Client Form" },
    { key: "checklist_artwork_in", label: "Artwork In" },
    { key: "checklist_proof_approved", label: "Proof Approved" },
    { key: "checklist_purchase_order", label: "Purchase Order" },
    { key: "checklist_bottles", label: "Bottles" },
    { key: "checklist_art_order_logged", label: "New Art / Order Logged" },
  ];

  // Determine whether to show due date based on stage
  const showDueDate = order.stage === "wip" || order.stage === "completed";
  const showDaysInPreflight = order.stage === "preflight";

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
        {previousStages.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setMoveBackOpen(true)}>
            <ArrowDown size={14} className="mr-1 rotate-90" /> Move Back
          </Button>
        )}
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
              <Button onClick={() => setBolDialogOpen(true)}>Generate BOL</Button>
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
                <Button onClick={() => setAchDialogOpen(true)}>Payment: ACH</Button>
                <Button variant="outline" onClick={() => setCheckDialogOpen(true)}>Payment: Check</Button>
              </>
            ) : (
              <Button onClick={handleArchive}>Archive & Close Order</Button>
            )}
          </>
        )}
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
            <Detail label="Date Entered" value={formatDateShort(order.date_entered)} />

            {showDaysInPreflight && (
              <Detail
                label="Days in Pre-Flight"
                value={`${daysInPreflight} day${daysInPreflight !== 1 ? "s" : ""}`}
                className={daysInPreflight > 14 ? "text-destructive font-medium" : daysInPreflight > 7 ? "text-amber-600 font-medium" : ""}
              />
            )}

            {showDueDate && (
              <>
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
              </>
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
            <Detail label="Paid" value={order.paid ? `${order.pay_method} on ${formatDateShort(order.pay_date)}` : "No"} />
          </div>
        </div>
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Shipping</h3>
          <div className="space-y-2 text-sm">
            <Detail label="Shipped" value={order.shipped ? `Yes — ${formatDateShort(order.ship_date)}` : "No"} />
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
                <FileText size={16} className="text-muted-foreground shrink-0" />
                {renamingId === doc.id ? (
                  <Input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={e => e.key === "Enter" && saveRename()}
                    className="h-7 text-sm flex-1"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm flex-1">{doc.file_name}</span>
                )}
                <span className="text-xs bg-muted px-2 py-0.5 rounded shrink-0">{doc.file_type}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setPreviewUrl(doc.file_url)} className="text-muted-foreground hover:text-foreground p-1" title="Preview">
                    <Eye size={15} />
                  </button>
                  <button onClick={() => startRename(doc)} className="text-muted-foreground hover:text-foreground p-1" title="Rename">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => downloadFile(doc.file_url, doc.file_name)} className="text-muted-foreground hover:text-foreground p-1" title="Download">
                    <Download size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget({ id: doc.id, file_url: doc.file_url })} className="text-muted-foreground hover:text-destructive p-1" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
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
          <p className="text-xs text-muted-foreground mt-1">Images (JPG/PNG) will be auto-converted to PDF</p>
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
            <Detail label="Address" value={formatAddress(order.clients.street_address, order.clients.city, order.clients.state, order.clients.zip)} />
          </div>
        </details>
      )}

      {/* Document Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Document Preview</DialogTitle></DialogHeader>
          {previewUrl && (
            previewUrl.toLowerCase().includes(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[70vh]" />
            ) : (
              <img src={previewUrl} alt="Document" className="max-w-full max-h-[70vh] mx-auto" />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this document? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Back Dialog */}
      <Dialog open={moveBackOpen} onOpenChange={setMoveBackOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move Order Back</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Select previous stage:</Label>
            <Select value={moveBackTarget} onValueChange={setMoveBackTarget}>
              <SelectTrigger><SelectValue placeholder="Choose stage" /></SelectTrigger>
              <SelectContent>
                {previousStages.map(s => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveBackOpen(false)}>Cancel</Button>
            <Button disabled={!moveBackTarget} onClick={async () => {
              await moveStage(moveBackTarget);
              setMoveBackOpen(false);
              setMoveBackTarget("");
            }}>
              Move Back to {STAGES.find(s => s.key === moveBackTarget)?.label || "..."}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ACH Payment Dialog */}
      <Dialog open={achDialogOpen} onOpenChange={setAchDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record ACH Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date Received</Label>
              <Input type="date" value={achDate} onChange={e => setAchDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAchDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAchPayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check Payment Dialog */}
      <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Check Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Check Number</Label>
              <Input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="Enter check number" />
            </div>
            <div>
              <Label>Date Received</Label>
              <Input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCheckPayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOL Generation Dialog */}
      <Dialog open={bolDialogOpen} onOpenChange={setBolDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Bill of Lading</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">A BOL number will be auto-assigned. The PDF will be saved to this order's documents.</p>
            <div>
              <Label>Carrier</Label>
              <Input value={bolCarrier} onChange={e => setBolCarrier(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBolDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerateBol}>Generate BOL</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${className} whitespace-pre-line text-right`}>{value || "—"}</span>
    </div>
  );
}
