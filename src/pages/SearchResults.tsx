import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStageBadgeClass, getStageLabel } from "@/lib/constants";
import { Search, Paperclip, Mail, Users, X, Send, Edit } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { sendEmailViaWebhook, Email } from "@/lib/emailData";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  getContributorCount,
  getShownContributorMessages,
  getOverflowContributorFirstNames,
  extractFirstName,
  extractSnippet,
} from "@/lib/threadHelpers";

interface SearchResultsProps {
  searchQuery: string;
}

interface OrderResult {
  id: string;
  item_name: string;
  client_po: string | null;
  vendor_po: string | null;
  stage: string;
  clients: { company: string } | null;
}

interface ArchivedResult {
  id: string;
  year: string | null;
  month: string | null;
  client_company: string | null;
  description: string | null;
  size: string | null;
  quantity: number | null;
  original_order_id: string | null;
}

interface ClientResult {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
}

interface EmailResult {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  category: string | null;
  created_at: string | null;
  direction: string | null;
  approved_sent_at: string | null;
  status: string | null;
  draft_response: string | null;
  body: string | null;
  gmail_id: string | null;
  thread_id: string | null;
  tier: string | null;
  attachments: any;
  to_recipients: string | null;
  cc_recipients: string | null;
  to_email_all: string | null;
  cc_emails: string | null;
  acknowledged: boolean | null;
  resolved_at: string | null;
  auto_sent_at: string | null;
  holding_sent_at: string | null;
  quote_data: any;
  client_id: string | null;
}

interface CallResult {
  id: string;
  caller_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  call_reason: string | null;
  created_at: string | null;
}

interface ProductResult {
  id: string;
  product_name: string;
  size: string | null;
  material: string | null;
  container_color: string | null;
  artwork_url: string | null;
  clients: { company: string } | null;
}

const PREVIEW_LIMIT = 5;

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  return format(new Date(dateStr), "MMM d, h:mm a");
}

/** Strip n8n footer text */
function stripN8nFooter(html: string): string {
  return html.replace(/This email was sent automatically with n8n\.?/gi, "").replace(/<p>\s*<\/p>/g, "");
}

/** Split draft_response at the FIRST <hr> only */
function splitDraftAtHr(html: string): { draftPart: string; quotedPart: string | null } {
  const hrIndex = html.search(/<hr[\s/>]/i);
  if (hrIndex === -1) return { draftPart: html, quotedPart: null };
  return {
    draftPart: html.substring(0, hrIndex),
    quotedPart: html.substring(hrIndex),
  };
}

export default function SearchResults({ searchQuery }: SearchResultsProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [archived, setArchived] = useState<ArchivedResult[]>([]);
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [emails, setEmails] = useState<EmailResult[]>([]);
  const [calls, setCalls] = useState<CallResult[]>([]);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailEmail, setDetailEmail] = useState<EmailResult | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductResult | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setOrders([]); setArchived([]); setClients([]); setEmails([]); setCalls([]); setProducts([]);
      return;
    }

    const doSearch = async () => {
      setLoading(true);
      const term = `%${searchQuery.trim()}%`;

      const [orderRes, orderByClient, archRes, clientRes, emailRes, callRes, productRes, productByClient] = await Promise.all([
        supabase.from("orders").select("id, item_name, client_po, vendor_po, stage, clients!inner(company)")
          .eq("archived", false)
          .or(`item_name.ilike.${term},client_po.ilike.${term},vendor_po.ilike.${term},invoice_num.ilike.${term},clients.company.ilike.${term}`)
          .limit(PREVIEW_LIMIT),
        supabase.from("orders").select("id, item_name, client_po, vendor_po, stage, clients!inner(company)")
          .eq("archived", false).ilike("clients.company" as any, term).limit(PREVIEW_LIMIT),
        supabase.from("archived_orders").select("id, year, month, client_company, description, size, quantity, original_order_id")
          .or(`client_company.ilike.${term},description.ilike.${term}`).limit(PREVIEW_LIMIT),
        supabase.from("clients").select("id, company, contact_name, email")
          .or(`company.ilike.${term},contact_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`).limit(PREVIEW_LIMIT),
        supabase.from("emails").select("*")
          .or(`from_email.ilike.${term},from_name.ilike.${term},subject.ilike.${term},body.ilike.${term},to_recipients.ilike.${term},cc_recipients.ilike.${term}`)
          .order("created_at", { ascending: false })
          .limit(PREVIEW_LIMIT),
        supabase.from("calls").select("id, caller_name, company_name, phone_number, call_reason, created_at")
          .or(`caller_name.ilike.${term},company_name.ilike.${term},phone_number.ilike.${term},call_reason.ilike.${term}`).limit(PREVIEW_LIMIT),
        supabase.from("catalog").select("id, product_name, size, material, container_color, artwork_url, clients(company)")
          .or(`product_name.ilike.${term},size.ilike.${term},material.ilike.${term},container_color.ilike.${term}`)
          .eq("archived", false).limit(PREVIEW_LIMIT),
        supabase.from("catalog").select("id, product_name, size, material, container_color, artwork_url, clients!inner(company)")
          .ilike("clients.company" as any, term)
          .eq("archived", false).limit(PREVIEW_LIMIT),
      ]);

      const allOrders = [...(orderRes.data || []), ...(orderByClient.data || [])];
      const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values()).slice(0, PREVIEW_LIMIT);
      setOrders(uniqueOrders as unknown as OrderResult[]);
      setArchived((archRes.data || []) as ArchivedResult[]);
      setClients((clientRes.data || []) as ClientResult[]);
      setEmails((emailRes.data || []) as unknown as EmailResult[]);
      setCalls((callRes.data || []) as CallResult[]);
      const allProducts = [...(productRes.data || []), ...(productByClient.data || [])];
      const uniqueProducts = Array.from(new Map(allProducts.map(p => [p.id, p])).values()).slice(0, PREVIEW_LIMIT);
      setProducts(uniqueProducts as unknown as ProductResult[]);
      setLoading(false);
    };

    doSearch();
  }, [searchQuery]);

  const noResults = !loading && orders.length === 0 && archived.length === 0 && clients.length === 0 && emails.length === 0 && calls.length === 0 && products.length === 0;

  if (!searchQuery.trim()) {
    return (
      <div className="p-4 md:p-6 max-w-[1400px]">
        <h1 className="text-2xl font-serif mb-4">Search</h1>
        <p className="text-muted-foreground font-sans">Type in the search bar to find orders, clients, emails, calls, products, and more.</p>
      </div>
    );
  }

  // Fetch full thread emails for any matching email results, in one query.
  const threadIds = useMemo(
    () => [...new Set(emails.map(e => e.thread_id).filter(Boolean) as string[])],
    [emails]
  );
  const { data: allThreadEmails = [] } = useQuery({
    queryKey: ["search-thread-emails", threadIds],
    queryFn: async () => {
      if (threadIds.length === 0) return [];
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .in("thread_id", threadIds);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: threadIds.length > 0,
    staleTime: 60 * 1000,
  });
  const threadEmailsMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of allThreadEmails) {
      if (!e.thread_id) continue;
      const arr = map.get(e.thread_id);
      if (arr) arr.push(e);
      else map.set(e.thread_id, [e]);
    }
    return map;
  }, [allThreadEmails]);
  // Track first occurrence of each thread_id in the email results list, so
  // the snippet block only renders once per thread.
  const firstOccurrenceIds = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (const e of emails) {
      if (!e.thread_id) continue;
      if (!seen.has(e.thread_id)) {
        seen.add(e.thread_id);
        ids.add(e.id);
      }
    }
    return ids;
  }, [emails]);

  const renderThreadSnippet = (threadId: string | null) => {
    if (!threadId) return null;
    const siblings = threadEmailsMap.get(threadId) || [];
    if (getContributorCount(siblings) < 3) return null;
    const shown = getShownContributorMessages(siblings, 3);
    const overflow = getOverflowContributorFirstNames(siblings, shown);
    return (
      <div className="mt-3 border-l-2 border-[#d4cfc3] pl-3 flex flex-col gap-1.5">
        {shown.map((msg) => (
          <div key={msg.id} className="text-xs font-sans text-muted-foreground truncate">
            <span className="font-semibold text-foreground/80">
              {extractFirstName(msg.from_name, msg.from_email)}:
            </span>{" "}
            {extractSnippet(msg.body, 65)}
          </div>
        ))}
        {overflow.length > 0 && (
          <div className="text-[11px] font-sans italic text-muted-foreground/80 truncate">
            + {overflow.length} earlier in thread ({overflow.join(", ")})
          </div>
        )}
      </div>
    );
  };

  const renderSection = (title: string, count: number, children: React.ReactNode) => count > 0 ? (
    <div>
      <h2 className="text-lg font-serif mb-2">{title} ({count})</h2>
      {children}
    </div>
  ) : null;


  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center gap-2">
        <Search size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-serif">Results for "{searchQuery}"</h1>
      </div>

      {loading && <div className="text-muted-foreground font-sans">Searching...</div>}
      {noResults && <div className="text-muted-foreground py-8 text-center font-sans">No results found for "{searchQuery}"</div>}

      {/* Clients */}
      {renderSection("Clients", clients.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
            </tr></thead>
            <tbody>{clients.map(c => (
              <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{c.company}</td>
                <td className="p-3">{c.contact_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Active Orders */}
      {renderSection("Active Orders", orders.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client PO</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Stage</th>
            </tr></thead>
            <tbody>{orders.map(o => (
              <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{o.item_name}</td>
                <td className="p-3">{o.clients?.company}</td>
                <td className="p-3 text-muted-foreground">{o.client_po || "—"}</td>
                <td className="p-3"><Badge variant="secondary" className={`text-xs ${getStageBadgeClass(o.stage)}`}>{getStageLabel(o.stage)}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Products */}
      {renderSection("Products", products.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Size</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Material</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Color</th>
            </tr></thead>
            <tbody>{products.map(p => (
              <tr key={p.id} onClick={() => navigate(`/catalog?product=${p.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium flex items-center gap-1.5">
                  {p.artwork_url && <Paperclip size={13} className="text-muted-foreground shrink-0" />}
                  {p.product_name}
                </td>
                <td className="p-3">{p.clients?.company || "—"}</td>
                <td className="p-3 text-muted-foreground">{p.size || "—"}</td>
                <td className="p-3 text-muted-foreground">{p.material || "—"}</td>
                <td className="p-3 text-muted-foreground">{p.container_color || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Emails */}
      {renderSection("Emails", emails.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">From</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Subject</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
            </tr></thead>
            <tbody>{emails.map(e => {
              const showSnippet = firstOccurrenceIds.has(e.id);
              return (
              <tr key={e.id} onClick={() => setDetailEmail(e)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer align-top">
                <td className="p-3 font-medium">{e.from_name || e.from_email}</td>
                <td className="p-3">
                  <div>{e.subject}</div>
                  {showSnippet && renderThreadSnippet(e.thread_id)}
                </td>
                <td className="p-3 text-muted-foreground">{e.category || "—"}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">{formatTime((e.direction === "outbound" && (e as any).approved_sent_at) ? (e as any).approved_sent_at : e.created_at)}</td>
              </tr>
              );
            })}</tbody>

          </table>
        </div>
      ))}

      {/* Calls */}
      {renderSection("Calls", calls.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Caller</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
            </tr></thead>
            <tbody>{calls.map(c => (
              <tr key={c.id} onClick={() => navigate("/calls")} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{c.caller_name || "Unknown"}</td>
                <td className="p-3">{c.company_name || "—"}</td>
                <td className="p-3 text-muted-foreground truncate max-w-xs">{c.call_reason || "—"}</td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">{formatTime(c.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Archived Orders */}
      {renderSection("Archived Orders", archived.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Year</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Qty</th>
            </tr></thead>
            <tbody>{archived.map(a => (
              <tr key={a.id} onClick={() => navigate(`/completed?highlight=${a.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3">{a.year}</td>
                <td className="p-3">{a.client_company}</td>
                <td className="p-3">{a.description}</td>
                <td className="p-3">{a.quantity?.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Email Detail Sheet */}
      <Sheet open={!!detailEmail} onOpenChange={() => setDetailEmail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 flex flex-col h-full">
          {detailEmail && (
            <>
              <SheetHeader className="p-6 pb-4 border-b shrink-0">
                <SheetTitle className="font-serif text-lg">{detailEmail.subject}</SheetTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
                  <span>{detailEmail.from_name}</span>
                  <span>&lt;{detailEmail.from_email}&gt;</span>
                  <span>•</span>
                  <span>{formatTime((detailEmail.direction === "outbound" && (detailEmail as any).approved_sent_at) ? (detailEmail as any).approved_sent_at : detailEmail.created_at)}</span>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {renderThreadSnippet(detailEmail.thread_id)}
                {/* Draft response */}
                {detailEmail.draft_response && (() => {
                  const cleaned = stripN8nFooter(detailEmail.draft_response);
                  const { draftPart, quotedPart } = splitDraftAtHr(cleaned);
                  return (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Draft Response</span>
                      <div className="bg-muted/30 rounded-xl p-4 text-sm font-sans email-html-content max-w-none" dangerouslySetInnerHTML={{ __html: draftPart }} />
                      {quotedPart && (
                        <Accordion type="single" collapsible className="w-full mt-3">
                          <AccordionItem value="quoted-email" className="border rounded-xl">
                            <AccordionTrigger className="px-4 py-3 text-xs font-medium text-muted-foreground font-sans hover:no-underline">Original Email</AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="text-sm font-sans email-html-content max-w-none" style={{ borderLeft: '3px solid #ccc', paddingLeft: '12px', marginTop: '10px', color: '#555' }} dangerouslySetInnerHTML={{ __html: quotedPart }} />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </div>
                  );
                })()}

                {/* Original email body */}
                {detailEmail.body && (() => {
                  const cleaned = stripN8nFooter(detailEmail.draft_response || "");
                  const hasQuotedInDraft = cleaned ? splitDraftAtHr(cleaned).quotedPart !== null : false;
                  if (hasQuotedInDraft) return null;
                  return (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="original-email" className="border rounded-xl">
                        <AccordionTrigger className="px-4 py-3 text-xs font-medium text-muted-foreground font-sans hover:no-underline">Original Email</AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="text-sm font-sans email-html-content max-w-none" style={{ borderLeft: '3px solid #ccc', paddingLeft: '12px', marginTop: '10px', color: '#555' }} dangerouslySetInnerHTML={{ __html: (() => {
                            const body = stripN8nFooter(detailEmail.body);
                            if (/<(?:div|p|br|span|table|a|b|i|strong|em|ul|ol|li|h[1-6]|img|blockquote)\b/i.test(body)) return body;
                            const lines = body.split(/\r?\n/).map(line => line.replace(/^(?:>\s*)+/g, "").trimEnd()).filter(line => line !== ">" && line !== "> ");
                            return `<div style="font-family: Tahoma, sans-serif; font-size: 12pt; line-height: 1.6;">${lines.join("<br>")}</div>`;
                          })() }} />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })()}
              </div>
              <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
                <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { setDetailEmail(null); navigate("/inbox"); }}>
                  <Mail size={12} /> Open in Inbox
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Product Detail Sheet */}
      <Sheet open={!!detailProduct} onOpenChange={() => setDetailProduct(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[400px] p-0 flex flex-col h-full">
          {detailProduct && (
            <>
              <SheetHeader className="p-6 pb-4 border-b shrink-0">
                <SheetTitle className="font-serif text-lg">{detailProduct.product_name}</SheetTitle>
                <div className="text-sm text-muted-foreground font-sans">{detailProduct.clients?.company}</div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm font-sans">
                  <div><span className="text-muted-foreground">Size:</span> <span className="font-medium">{detailProduct.size || "—"}</span></div>
                  <div><span className="text-muted-foreground">Material:</span> <span className="font-medium">{detailProduct.material || "—"}</span></div>
                  <div><span className="text-muted-foreground">Color:</span> <span className="font-medium">{detailProduct.container_color || "—"}</span></div>
                </div>
              </div>
              <div className="border-t p-4 flex items-center gap-2 bg-background shrink-0">
                <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { setDetailProduct(null); navigate("/catalog"); }}>
                  Open in Catalog
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
