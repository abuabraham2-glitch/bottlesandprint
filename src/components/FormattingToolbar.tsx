import { Bold, Italic, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FormattingToolbar() {
  const apply = (command: string) => {
    document.execCommand(command, false);
  };

  return (
    <div className="flex items-center gap-0.5 mb-1">
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-xs font-bold" onMouseDown={e => { e.preventDefault(); apply("bold"); }}>
        <Bold size={14} />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-xs italic" onMouseDown={e => { e.preventDefault(); apply("italic"); }}>
        <Italic size={14} />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-xs underline" onMouseDown={e => { e.preventDefault(); apply("underline"); }}>
        <Underline size={14} />
      </Button>
    </div>
  );
}
