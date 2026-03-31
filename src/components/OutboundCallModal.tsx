import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Device, Call } from "@twilio/voice-sdk";

type CallState = "ready" | "connecting" | "live" | "ended";

interface OutboundCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillNumber?: string;
  prefillName?: string;
}

const TOKEN_ENDPOINT = "https://bottlesandprint.app.n8n.cloud/webhook/twilio-token";

export function OutboundCallModal({ open, onOpenChange, prefillNumber = "", prefillName = "" }: OutboundCallModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(prefillNumber);
  const [callState, setCallState] = useState<CallState>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync prefill when modal opens
  useEffect(() => {
    if (open) {
      setPhoneNumber(prefillNumber);
      setCallState("ready");
      setElapsed(0);
    }
  }, [open, prefillNumber]);

  // Cleanup on unmount or close
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (activeCallRef.current) {
      try { activeCallRef.current.disconnect(); } catch {}
      activeCallRef.current = null;
    }
    if (deviceRef.current) {
      try { deviceRef.current.destroy(); } catch {}
      deviceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) cleanup();
    return cleanup;
  }, [open, cleanup]);

  // Timer for live call
  useEffect(() => {
    if (callState === "live") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleCall = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Enter a phone number");
      return;
    }

    setLoading(true);
    setCallState("connecting");

    try {
      // Fetch token
      const tokenRes = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!tokenRes.ok) throw new Error("Failed to get token");
      const tokenData = await tokenRes.json();
      const token = tokenData.token || tokenData;

      // Initialize device
      const device = new Device(typeof token === "string" ? token : JSON.stringify(token), {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });
      deviceRef.current = device;

      // Make the call
      const call = await device.connect({
        params: { To: phoneNumber.trim() },
      });
      activeCallRef.current = call;

      call.on("accept", () => {
        setCallState("live");
        setLoading(false);
      });

      call.on("disconnect", () => {
        setCallState("ended");
        setLoading(false);
      });

      call.on("cancel", () => {
        setCallState("ended");
        setLoading(false);
      });

      call.on("error", (err: any) => {
        console.error("Call error:", err);
        toast.error("Call failed: " + (err?.message || "Unknown error"));
        setCallState("ready");
        setLoading(false);
      });
    } catch (err: any) {
      console.error("Outbound call error:", err);
      toast.error("Could not start call");
      setCallState("ready");
      setLoading(false);
    }
  };

  const handleHangUp = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    }
    setCallState("ended");
  };

  const handleClose = () => {
    if (callState === "live" || callState === "connecting") {
      handleHangUp();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {callState === "ready" || callState === "connecting" ? "Make a Call" : callState === "live" ? "Call in Progress" : "Call Ended"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* READY / CONNECTING */}
          {(callState === "ready" || callState === "connecting") && (
            <>
              <Input
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                className="rounded-xl h-11 text-base"
                disabled={callState === "connecting"}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleCall}
                  disabled={callState === "connecting" || loading}
                >
                  {callState === "connecting" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Phone size={16} />
                  )}
                  {callState === "connecting" ? "Connecting..." : "Call"}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={handleClose}
                  disabled={callState === "connecting"}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}

          {/* LIVE */}
          {callState === "live" && (
            <div className="text-center space-y-4 py-4">
              {prefillName && (
                <p className="text-sm font-medium font-sans">{prefillName}</p>
              )}
              <p className="text-sm text-muted-foreground font-sans">{phoneNumber}</p>
              <p className="text-3xl font-mono font-medium text-foreground">{formatTimer(elapsed)}</p>
              <Button
                className="rounded-xl gap-1.5 bg-red-600 hover:bg-red-700 text-white px-8"
                onClick={handleHangUp}
              >
                <PhoneOff size={16} /> Hang Up
              </Button>
            </div>
          )}

          {/* ENDED */}
          {callState === "ended" && (
            <div className="text-center space-y-4 py-4">
              <p className="text-sm text-muted-foreground font-sans">
                Call ended. Processing recording...
              </p>
              <Button variant="outline" className="rounded-xl" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
