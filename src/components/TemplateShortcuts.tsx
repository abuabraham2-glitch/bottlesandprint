import React from "react";

interface TemplateShortcutsProps {
  editorRef: React.RefObject<HTMLDivElement>;
  setSubject?: (s: string) => void;
  currentSubject?: string;
}

const PROOF_TEXT = `See attached proof. Let me know if approved for film. Remember to print it out as "actual size" and not "to scale" or "fit to page". After putting it up against the bottle/jar, please make sure to check all the text, spacing, and colors to make sure everything is correct. Once proof is approved and film is made, it cannot be altered.`;

const ORDER_COMPLETE_TEXT = `I just sent the invoice over via QuickBooks. Please see ACH information below.

ACH Information:
Thread Bank
Container and Deco Solutions
Account# 200000014846
Routing# 064209588

Please let us know when you initiate the ACH transfer so we can keep an eye out for it.`;

const DELIVERY_ADDRESS_TEXT = `Your Company Name c/o Bottles and Print
12970 Branford St, Unit D
Pacoima, CA 91331

Shipping/Receiving Hours are 8am-2pm.`;

const APOLOGY_V1 = `My apologies. I'm sure you have figured out everything for your project by now, but I wanted to apologize for overlooking this and not getting back to you in a timely manner. If you still need help with your deco needs, even if it's a consultation or a re-quote, we are available to assist. If you are all settled, as we expect you are, then we hope you are happy with your vendor(s) and business is going well.`;

const APOLOGY_V2 = `My apologies. I wanted to apologize for overlooking this and not getting back to you in a timely manner. I'm sure you have figured everything out by now, but I still owe you the respect to give you the quote you requested.`;

const APOLOGY_HTML = `${APOLOGY_V1}<br><br><div style="text-align:center; color:#94a3b8; font-weight:600; letter-spacing:0.1em; margin:12px 0;">— OR —</div><br>${APOLOGY_V2}`;

function toHtml(plain: string) {
  return plain.replace(/\n/g, "<br>");
}

function insertAtCursor(editor: HTMLDivElement, html: string) {
  const fullHtml = html + "<br><br>";
  const sel = window.getSelection();
  const editorHasSelection =
    sel &&
    sel.rangeCount > 0 &&
    editor.contains(sel.getRangeAt(0).commonAncestorContainer);

  if (!editorHasSelection) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  } else {
    editor.focus();
  }

  // Use execCommand to insert at caret while preserving existing content
  document.execCommand("insertHTML", false, fullHtml);
}

export function TemplateShortcuts({ editorRef, setSubject, currentSubject }: TemplateShortcutsProps) {
  const handleInsert = (text: string, subjectIfBlank?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    insertAtCursor(editor, toHtml(text));
    if (subjectIfBlank && setSubject && (!currentSubject || !currentSubject.trim())) {
      setSubject(subjectIfBlank);
    }
  };

  const handleInsertHtml = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    insertAtCursor(editor, html);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-sans text-muted-foreground">Templates:</span>
      <button
        type="button"
        className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors border border-blue-200"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleInsert(PROOF_TEXT, "Artwork Proof")}
      >
        Proof Approval
      </button>
      <button
        type="button"
        className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors border border-emerald-200"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleInsert(ORDER_COMPLETE_TEXT, "Order Complete")}
      >
        Order Complete
      </button>
      <button
        type="button"
        className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors border border-amber-200"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleInsert(DELIVERY_ADDRESS_TEXT)}
      >
        Delivery Address
      </button>
      <button
        type="button"
        className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors border border-rose-200"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleInsertHtml(APOLOGY_HTML)}
      >
        Apology
      </button>
    </div>
  );
}
