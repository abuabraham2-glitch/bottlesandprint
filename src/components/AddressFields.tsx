import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/lib/constants";

interface AddressFieldsProps {
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  onChange: (field: string, value: string) => void;
  streetField: string;
  cityField: string;
  stateField: string;
  zipField: string;
}

export default function AddressFields({ label, street, city, state, zip, onChange, streetField, cityField, stateField, zipField }: AddressFieldsProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        placeholder="Street Address"
        value={street}
        onChange={e => onChange(streetField, e.target.value)}
      />
      <div className="grid grid-cols-[1fr_80px_100px] gap-2">
        <Input
          placeholder="City"
          value={city}
          onChange={e => onChange(cityField, e.target.value)}
        />
        <Select value={state} onValueChange={v => onChange(stateField, v)}>
          <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Zip"
          value={zip}
          onChange={e => onChange(zipField, e.target.value)}
        />
      </div>
    </div>
  );
}
