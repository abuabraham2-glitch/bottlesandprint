import { useParams, useNavigate } from "react-router-dom";
import { useOrder, useOrders, useUpdateOrder, useOrderDocuments, useUploadDocument, useArchiveOrder, useRenameDocument, useDeleteDocument, getNextBolNumber, updateCatalogLastRun, getSignedUrl, extractStoragePath } from "@/lib/data";
import { STAGES, checklistCount, daysUntilDue, daysSinceCreated, DOC_TYPES, formatAddress, formatDateShort, getStageBadgeClass, getStageLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, Eye, Upload, FileText, Pencil, Trash2, Download, ArrowDown, Link2, RefreshCw } from "lucide-react";
import { syncClientToQB, pushInvoiceToQB, pushVendorPoToQB, recordPaymentInQB, buildOrderDescription } from "@/lib/quickbooks";
import { toast } from "sonner";
import { useState, useCallback, useRef, useMemo } from "react";
import { format, addWeeks } from "date-fns";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { generateBolPdf } from "@/lib/generateBolPdf";
import { useQueryClient } from "@tanstack/react-query";

// Inline editable field component
function EditableField({ label, value, onSave, type = "text" }: { label: string; value: string | number | null | undefined; onSave: (val: string) => void; type?: string }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEdit = () => {
    setEditValue(value?.toString() || "");
    setEditing(true);
  };

  const save = () => {
    setEditing(false);
    if (editValue !== (value?.toString() || "")) {
      onSave(editValue);
    }
  };

  return (
    <div className="flex justify-between items-center group">
      <span className="text-muted-foreground">{label}</span>
      {editing ? (
        type === "textarea" ? (
          <Textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={save}
            className="w-48 text-sm"
            autoFocus
            rows={3}
          />
        ) : (
          <Input
            type={type}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={save}
            onKeyDown={e => e.key === "Enter" && save()}
            className="h-7 text-sm w-48"
            autoFocus
          />
        )
      ) : (
        <span className="flex items-center gap-1 cursor-pointer text-right" onClick={startEdit}>
          <span>{value?.toString() ? (type === "number" ? Number(value).toLocaleString() : value.toString()) : "—"}</span>
          <Pencil size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </span>
      )}
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useOrder(id!);
  const { data: allOrders = [] } = useOrders();
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
  const [bolRegenOpen, setBolRegenOpen] = useState(false);
  const [deleteOrderOpen, setDeleteOrderOpen] = useState(false);
  const [qbPaymentPromptOpen, setQbPaymentPromptOpen] = useState(false);
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState("");

  const [bolChoiceOpen, setBolChoiceOpen] = useState(false);
  const [invoiceChoiceOpen, setInvoiceChoiceOpen] = useState(false);

  const [editingVendorPo, setEditingVendorPo] = useState(false);
  const [vendorPoValue, setVendorPoValue] = useState("");
  const [vendorPoApplyOpen, setVendorPoApplyOpen] = useState(false);
  const [pendingVendorPo, setPendingVendorPo] = useState("");

  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  const update = useCallback(async (updates: Record<string, any>) => {
    if (!id) return;
    await updateOrder.mutateAsync({ id, ...updates } as any);
  }, [id, updateOrder]);

  const relatedOrders = useMemo(() => {
    if (!order?.client_po) return [];
    return allOrders.filter(o => o.client_po === order.client_po && o.id !== order.id && !o.archived);
  }, [order, allOrders]);

  const hasRelatedOrders = relatedOrders.length > 0;

  if (isLoading || !order) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const stageIndex = STAGES.findIndex(s => s.key === order.stage);
  const checked = checklistCount(order);
  const allChecked = checked === 6;
  const days = daysUntilDue(order.due_date);
  const daysInPreflight = daysSinceCreated(order.date_entered);

  const saveField = (field: string, type?: string) => (val: string) => {
    let parsed: any = val || null;
    if (type === "number") parsed = val ? parseInt(val) : null;
    update({ [field]: parsed });
    toast.success("Updated successfully");
  };

  const moveStage = async (newStage: string) => {
    // Guard: require vendor_po_reviewed before WIP
    if (newStage === "wip" && !order.vendor_po_reviewed) {
      toast.error("Vendor PO must be reviewed in QuickBooks before moving to WIP.");
      return;
    }
    // Guard: require invoice_reviewed before Ship (to_ship)
    if (newStage === "to_ship" && !order.invoice_reviewed) {
      toast.error("Invoice must be reviewed in QuickBooks before shipping.");
      return;
    }
    const updates: Record<string, any> = { stage: newStage };
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

  // Check if this order shares its Client PO with others
  const isSharedPo = hasRelatedOrders;
  const allRelatedShipped = isSharedPo && relatedOrders.every(o => o.shipped);
  const allGroupShipped = isSharedPo && order.shipped && allRelatedShipped;

  const createInvoice = async () => {
    // For shared PO orders, don't allow individual invoice creation
    if (isSharedPo) {
      toast.error("Multiple orders share this PO — invoice will be generated when all orders are complete.");
      return;
    }
    await doCreateInvoice(false);
  };

  const doCreateInvoice = async (combined: boolean) => {
    // No longer generating invoice number in-app; QB will auto-assign
    await update({ invoiced: true });
    if (combined) {
      for (const ro of relatedOrders) {
        await updateOrder.mutateAsync({ id: ro.id, invoiced: true } as any);
      }
      toast.success(`Invoice created for ${relatedOrders.length + 1} items under PO ${order.client_po}`);
    } else {
      toast.success("Invoice created");
    }
    setInvoiceChoiceOpen(false);
  };

  const handleAchPayment = async () => {
    await update({ paid: true, pay_method: "ACH", pay_date: achDate });
    setAchDialogOpen(false);
    toast.success("ACH payment recorded");
    setPendingPaymentMethod("ACH");
    setQbPaymentPromptOpen(true);
  };

  const handleCheckPayment = async () => {
    const method = checkNumber ? `Check #${checkNumber}` : "Check";
    await update({ paid: true, pay_method: method, pay_date: checkDate });
    setCheckDialogOpen(false);
    toast.success("Check payment recorded");
    setPendingPaymentMethod("Check");
    setQbPaymentPromptOpen(true);
  };

  const handleArchive = async () => {
    if (!confirm("Archive this order? It will be moved to completed data.")) return;
    await archiveOrder.mutateAsync(order);
    toast.success("Order archived");
    navigate("/orders");
  };

  const handleDeleteOrder = async () => {
    if (!id) return;
    for (const doc of documents) {
      const storagePath = extractStoragePath(doc.file_url);
      await supabase.storage.from("order-documents").remove([storagePath]);
    }
    await supabase.from("order_documents").delete().eq("order_id", id);
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) { toast.error("Failed to delete order"); return; }
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success("Order deleted");
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

  const openPreview = async (fileUrl: string) => {
    try {
      const url = await getSignedUrl(fileUrl);
      setPreviewUrl(url);
    } catch {
      toast.error("Failed to load document");
    }
  };

  const downloadFile = async (fileUrl: string, name: string) => {
    try {
      const url = await getSignedUrl(fileUrl);
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
      toast.error("Failed to download document");
    }
  };

  const initiateGenerateBol = () => {
    if (hasRelatedOrders) {
      setBolChoiceOpen(true);
    } else {
      setBolDialogOpen(true);
    }
  };

  const handleGenerateBol = async (combined = false) => {
    if (!order || !id) return;
    const bolNum = await getNextBolNumber();
    const combOrders = combined ? relatedOrders : undefined;

    const pdfBlob = generateBolPdf({ bolNumber: bolNum, carrier: bolCarrier, order, combinedOrders: combOrders });
    const pdfFile = new File([pdfBlob], `BOL-${bolNum}.pdf`, { type: "application/pdf" });
    const filePath = `${id}/${Date.now()}_BOL-${bolNum}.pdf`;
    await supabase.storage.from("order-documents").upload(filePath, pdfFile);

    await supabase.from("order_documents").insert({
      order_id: id,
      file_name: `BOL-${bolNum}.pdf`,
      file_type: "Signed BOL",
      file_url: filePath,
    });
    await update({ outgoing_bol: bolNum });

    if (combined) {
      for (const ro of relatedOrders) {
        await supabase.from("order_documents").insert({
          order_id: ro.id,
          file_name: `BOL-${bolNum}.pdf`,
          file_type: "Signed BOL",
          file_url: filePath,
        });
        await updateOrder.mutateAsync({ id: ro.id, outgoing_bol: bolNum } as any);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["order_documents", id] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    setBolDialogOpen(false);
    setBolChoiceOpen(false);
    toast.success(`BOL #${bolNum} generated${combined ? ` for ${relatedOrders.length + 1} items` : ""}`);
  };

  const handleRegenerateBol = async () => {
    if (!order || !id || !order.outgoing_bol) return;
    const bolNum = order.outgoing_bol;

    const existingBols = documents.filter(d => d.file_name.startsWith("BOL-"));
    for (const doc of existingBols) {
      const storagePath = extractStoragePath(doc.file_url);
      await supabase.storage.from("order-documents").remove([storagePath]);
      await supabase.from("order_documents").delete().eq("id", doc.id);
    }

    const pdfBlob = generateBolPdf({ bolNumber: bolNum, carrier: bolCarrier, order });
    const pdfFile = new File([pdfBlob], `BOL-${bolNum}.pdf`, { type: "application/pdf" });
    const filePath = `${id}/${Date.now()}_BOL-${bolNum}.pdf`;
    await supabase.storage.from("order-documents").upload(filePath, pdfFile);
    await supabase.from("order_documents").insert({
      order_id: id,
      file_name: `BOL-${bolNum}.pdf`,
      file_type: "Signed BOL",
      file_url: filePath,
    });
    queryClient.invalidateQueries({ queryKey: ["order_documents", id] });
    setBolRegenOpen(false);
    toast.success("BOL regenerated successfully");
  };

  const startVendorPoEdit = () => {
    setVendorPoValue(order.vendor_po || "");
    setEditingVendorPo(true);
  };

  const saveVendorPo = async () => {
    setEditingVendorPo(false);
    const val = vendorPoValue.trim() || null;
    if (val === order.vendor_po) return;

    if (hasRelatedOrders && val) {
      setPendingVendorPo(val);
      setVendorPoApplyOpen(true);
    } else {
      await update({ vendor_po: val });
      toast.success("Vendor PO updated");
    }
  };

  const applyVendorPoToGroup = async (applyAll: boolean) => {
    await update({ vendor_po: pendingVendorPo });
    if (applyAll) {
      for (const ro of relatedOrders) {
        await updateOrder.mutateAsync({ id: ro.id, vendor_po: pendingVendorPo } as any);
      }
      toast.success(`Vendor PO applied to ${relatedOrders.length + 1} orders`);
    } else {
      toast.success("Vendor PO updated");
    }
    setVendorPoApplyOpen(false);
  };

  const startNotesEdit = () => {
    setNotesValue(order.notes || "");
    setEditingNotes(true);
  };

  const saveNotes = () => {
    setEditingNotes(false);
    const val = notesValue.trim() || null;
    if (val !== (order.notes || null)) {
      update({ notes: val });
      toast.success("Updated successfully");
    }
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
              isSharedPo ? (
                <span className="text-sm text-muted-foreground">Multiple orders share this PO — invoice will be generated when all orders are complete.</span>
              ) : (
                <Button onClick={createInvoice}>Create Invoice</Button>
              )
            ) : (
              <Button onClick={() => moveStage("to_ship")}>Move to Ship</Button>
            )}
          </>
        )}
        {order.stage === "to_ship" && (
          <>
            {!order.outgoing_bol && (
              <Button onClick={initiateGenerateBol}>Generate BOL</Button>
            )}
            {order.outgoing_bol && (
              <>
                {(() => {
                  const bolDoc = documents.find(d => d.file_name.startsWith("BOL-"));
                  return bolDoc ? (
                    <Button variant="outline" onClick={() => openPreview(bolDoc.file_url)}>
                      <Eye size={14} className="mr-1" /> View/Download BOL
                    </Button>
                  ) : null;
                })()}
                <Button variant="outline" onClick={() => setBolRegenOpen(true)}>Regenerate BOL</Button>
              </>
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
        {(order.stage === "preflight" || order.stage === "wip") && !order.invoiced && !isSharedPo && (
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

        {/* Order Details - editable */}
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Order Details</h3>
          <div className="space-y-2 text-sm">
            <EditableField label="Container Type" value={order.bottle_type} onSave={saveField("bottle_type")} />
            <EditableField label="Container Size" value={order.bottle_size} onSave={saveField("bottle_size")} />
            <EditableField label="Material" value={order.material} onSave={saveField("material")} />
            <EditableField label="Container Color" value={order.bottle_color} onSave={saveField("bottle_color")} />
            <EditableField label="# Print Colors" value={order.num_colors} onSave={saveField("num_colors", "number")} type="number" />
            <EditableField label="Print Colors" value={order.print_colors} onSave={saveField("print_colors")} />
            <EditableField label="Quantity" value={order.quantity} onSave={saveField("quantity", "number")} type="number" />
            <EditableField label="Packing" value={order.packing} onSave={saveField("packing")} />
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
            <EditableField label="Client PO" value={order.client_po} onSave={saveField("client_po")} />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Vendor PO</span>
              <div className="flex items-center gap-1">
                {editingVendorPo ? (
                  <Input
                    value={vendorPoValue}
                    onChange={e => setVendorPoValue(e.target.value)}
                    onBlur={saveVendorPo}
                    onKeyDown={e => e.key === "Enter" && saveVendorPo()}
                    className="h-7 text-sm w-32"
                    autoFocus
                  />
                ) : (
                  <>
                    <span>{order.vendor_po || "—"}</span>
                    <button onClick={startVendorPoEdit} className="text-muted-foreground hover:text-foreground p-0.5">
                      <Pencil size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {(order.vendor_po || order.stage === "wip") && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Push Vendor PO</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                  const desc = hasRelatedOrders
                    ? [order, ...relatedOrders].map(o => `${o.clients?.company || ""} - ${buildOrderDescription(o)}`).join("\n")
                    : `${order.clients?.company || ""} - ${buildOrderDescription(order)}`;
                  const qty = hasRelatedOrders ? 1 : (order.quantity || 1);
                  const result = await pushVendorPoToQB({
                    description: desc,
                    quantity: qty,
                    memo: [order.item_name, order.bottle_size].filter(Boolean).join(" "),
                  });
                  if (result.ok) {
                    const updates: Record<string, any> = { vendor_po_reviewed: false };
                    if (result.docNumber) updates.vendor_po = result.docNumber;
                    await update(updates);
                  }
                }}>
                  <RefreshCw size={10} className="mr-1" /> Push Vendor PO to QuickBooks
                </Button>
              </div>
            )}
            <Detail label="Invoiced" value={order.invoiced ? (order.invoice_num ? `Yes — ${order.invoice_num}` : "Yes") : "No"} />
            {isSharedPo && !allGroupShipped && !order.invoiced && (
              <p className="text-xs text-amber-600">Multiple orders share this PO — invoice will be generated when all orders are complete.</p>
            )}
            {isSharedPo && allGroupShipped && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Combined Invoice</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                  const { utils, writeFile } = await import("xlsx");
                  const rows = [order, ...relatedOrders].map(o => ({
                    "Client PO": o.client_po || "",
                    "Product Name": o.item_name,
                    "Size": o.bottle_size || "",
                    "Material": o.material || "",
                    "Component": o.bottle_type || "",
                    "Quantity": o.quantity || 0,
                    "Description": buildOrderDescription(o),
                  }));
                  const ws = utils.json_to_sheet(rows);
                  utils.sheet_add_aoa(ws, [
                    [`${order.clients?.company || ""}`],
                    [`PO: ${order.client_po || ""}`],
                  ], { origin: "A1" });
                  const wb = utils.book_new();
                  utils.book_append_sheet(wb, ws, "Invoice Summary");
                  writeFile(wb, `Invoice-Summary-${order.client_po || "PO"}.xlsx`);
                  toast.success("Invoice summary downloaded");
                }}>
                  Generate Combined Invoice Summary
                </Button>
              </div>
            )}
            {!isSharedPo && order.invoiced && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Push Invoice</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                  const desc = buildOrderDescription(order);
                  const qty = order.quantity || 1;
                  const result = await pushInvoiceToQB({
                    company: order.clients?.company || "",
                    description: desc,
                    quantity: qty,
                    client_po: order.client_po || "",
                  });
                  if (result.ok) {
                    const updates: Record<string, any> = { invoice_reviewed: false };
                    if (result.docNumber) updates.invoice_num = result.docNumber;
                    await update(updates);
                  }
                }}>
                  <RefreshCw size={10} className="mr-1" /> Push to QB
                </Button>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className={order.paid ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                {order.paid ? `Yes` : "No"}
                {order.pay_method && order.paid ? ` — ${order.pay_method} on ${formatDateShort(order.pay_date)}` : ""}
              </span>
            </div>
            {/* QB Review Checkboxes */}
            {order.invoice_num && (
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-muted-foreground">Invoice reviewed in QB</span>
                <Checkbox checked={(order as any).invoice_reviewed || false} onCheckedChange={v => update({ invoice_reviewed: !!v })} />
              </label>
            )}
            {order.vendor_po && (
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-muted-foreground">Vendor PO reviewed in QB</span>
                <Checkbox checked={(order as any).vendor_po_reviewed || false} onCheckedChange={v => update({ vendor_po_reviewed: !!v })} />
              </label>
            )}
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

      {/* Related Orders (Same PO) */}
      {hasRelatedOrders && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Link2 size={16} />
            Related Orders (Same PO: {order.client_po})
          </h3>
          <div className="space-y-2">
            {relatedOrders.map(ro => (
              <div
                key={ro.id}
                onClick={() => navigate(`/orders/${ro.id}`)}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div>
                  <span className="font-medium text-sm">{ro.item_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{ro.bottle_size}</span>
                </div>
                <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(ro.stage)}`}>
                  {getStageLabel(ro.stage)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <button onClick={() => openPreview(doc.file_url)} className="text-muted-foreground hover:text-foreground p-1" title="Preview">
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

      {/* Notes - editable */}
      <div className="rounded-lg border-l-4 p-5 group" style={{ borderLeftColor: "#C2793D", backgroundColor: "#FBF0E5" }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold" style={{ color: "#C2793D" }}>Notes</h3>
          {!editingNotes && (
            <button onClick={startNotesEdit} className="text-muted-foreground hover:text-foreground p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil size={14} />
            </button>
          )}
        </div>
        {editingNotes ? (
          <Textarea
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            onBlur={saveNotes}
            className="text-sm"
            autoFocus
            rows={4}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap font-bold cursor-pointer" onClick={startNotesEdit}>
            {order.notes || <span className="font-normal text-muted-foreground italic">Click to add notes...</span>}
          </p>
        )}
      </div>

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

      {/* BOL Choice Dialog (for grouped orders) */}
      <Dialog open={bolChoiceOpen} onOpenChange={setBolChoiceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Bill of Lading</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This order is part of PO {order.client_po} with {relatedOrders.length} other item{relatedOrders.length > 1 ? "s" : ""}. What would you like to do?
          </p>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Carrier</Label>
              <Input value={bolCarrier} onChange={e => setBolCarrier(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setBolChoiceOpen(false); handleGenerateBol(false); }}>
              BOL for this item only
            </Button>
            <Button onClick={() => handleGenerateBol(true)}>
              Combined BOL for all {relatedOrders.length + 1} items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOL Generation Dialog (single item) */}
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
            <Button onClick={() => handleGenerateBol(false)}>Generate BOL</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOL Regeneration Confirmation */}
      <AlertDialog open={bolRegenOpen} onOpenChange={setBolRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate BOL</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new BOL replacing the previous one. The BOL number will remain the same. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label>Carrier</Label>
            <Input value={bolCarrier} onChange={e => setBolCarrier(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateBol}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice Choice Dialog (for grouped orders) */}
      <Dialog open={invoiceChoiceOpen} onOpenChange={setInvoiceChoiceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This order is part of PO {order.client_po} with {relatedOrders.length} other item{relatedOrders.length > 1 ? "s" : ""}. What would you like to do?
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setInvoiceChoiceOpen(false); doCreateInvoice(false); }}>
              Invoice this item only
            </Button>
            <Button onClick={() => doCreateInvoice(true)}>
              Invoice all {relatedOrders.length + 1} items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor PO Apply to Group Dialog */}
      <Dialog open={vendorPoApplyOpen} onOpenChange={setVendorPoApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Vendor PO</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Apply this Vendor PO to all {relatedOrders.length + 1} items under PO {order.client_po}?
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => applyVendorPoToGroup(false)}>This item only</Button>
            <Button onClick={() => applyVendorPoToGroup(true)}>Apply to all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Order Dialog */}
      <AlertDialog open={deleteOrderOpen} onOpenChange={setDeleteOrderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to permanently delete this order? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QB Payment Prompt */}
      <AlertDialog open={qbPaymentPromptOpen} onOpenChange={setQbPaymentPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record Payment in QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription>Would you like to record this payment in QuickBooks?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setQbPaymentPromptOpen(false)}>No</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setQbPaymentPromptOpen(false); await recordPaymentInQB({ invoice_num: order.invoice_num || "", company: order.clients?.company || "" }); }}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Order Link */}
      <div className="flex justify-end pt-2 pb-8">
        <Button variant="link" className="text-destructive text-sm" onClick={() => setDeleteOrderOpen(true)}>
          <Trash2 size={14} className="mr-1" /> Delete Order
        </Button>
      </div>
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
