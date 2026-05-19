import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChainPublic, useGetFaucetStatus, useClaimFaucet, getGetChainQueryKey, getGetFaucetStatusQueryKey } from "@workspace/api-client-react";
import ReCAPTCHA from "react-google-recaptcha";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ClaimModalProps {
  chain: ChainPublic | null;
  onClose: () => void;
}

export function ClaimModal({ chain, onClose }: ClaimModalProps) {
  const [address, setAddress] = useState("");
  const [debouncedAddress, setDebouncedAddress] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [step, setStep] = useState<"input" | "ad" | "result">("input");
  const [adCountdown, setAdCountdown] = useState(5);
  const [txHash, setTxHash] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const queryClient = useQueryClient();
  const claimMutation = useClaimFaucet();

  const isValidEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isValidEvmAddress(address)) {
        setDebouncedAddress(address);
      } else {
        setDebouncedAddress("");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [address]);

  const { data: status, isLoading: isStatusLoading } = useGetFaucetStatus(
    chain?.id || 0,
    debouncedAddress,
    { 
      query: { 
        enabled: !!chain && !!debouncedAddress,
        queryKey: getGetFaucetStatusQueryKey(chain?.id || 0, debouncedAddress)
      } 
    }
  );

  useEffect(() => {
    if (step === "ad") {
      if (adCountdown > 0) {
        const timer = setTimeout(() => setAdCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setStep("result");
      }
    }
    return undefined;
  }, [step, adCountdown]);

  const handleClaim = () => {
    if (!chain || !debouncedAddress || !captchaToken) return;
    setErrorMsg("");
    
    claimMutation.mutate({
      data: {
        chainId: chain.id,
        address: debouncedAddress,
        captchaToken
      }
    }, {
      onSuccess: (res) => {
        setTxHash(res.txHash);
        setClaimedAmount(res.amount);
        setStep("ad");
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey(chain.id) });
      },
      onError: (err: any) => {
        setErrorMsg(err?.data?.error || err.message || "Failed to claim");
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        setStep("input");
        setAddress("");
        setDebouncedAddress("");
        setCaptchaToken("");
        setAdCountdown(5);
        setErrorMsg("");
      }, 300);
      onClose();
    }
  };

  if (!chain) return null;

  return (
    <Dialog open={!!chain} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-mono uppercase tracking-tight">
            Claim {chain.name}
            {chain.isTestnet && (
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded-sm">
                TESTNET
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="flex flex-col gap-6 py-4">
            <div className="space-y-2">
              <label className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
                Wallet Address
              </label>
              <Input
                placeholder="0x..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="font-mono bg-background/50"
              />
              {debouncedAddress && isStatusLoading && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking eligibility...
                </div>
              )}
              {status && !status.canClaim && (
                <div className="text-sm text-destructive font-mono bg-destructive/10 p-3 rounded border border-destructive/20 mt-2">
                  Cannot claim yet. Next claim available {status.nextClaimAt ? formatDistanceToNow(new Date(status.nextClaimAt), { addSuffix: true }) : "later"}.
                </div>
              )}
            </div>

            {status?.canClaim && (
              <div className="flex flex-col items-center gap-6">
                <div className="bg-background/80 p-2 rounded-md border border-border inline-block">
                  <ReCAPTCHA
                    sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                    onChange={(val) => setCaptchaToken(val || "")}
                    theme="dark"
                  />
                </div>
                
                {errorMsg && (
                  <div className="text-sm text-destructive text-center">{errorMsg}</div>
                )}
                
                <Button 
                  onClick={handleClaim} 
                  disabled={!captchaToken || claimMutation.isPending}
                  className="w-full font-mono uppercase tracking-widest h-12 text-lg"
                >
                  {claimMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : `Claim ${chain.claimAmount} ${chain.symbol}`}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "ad" && (
          <div className="py-12 flex flex-col items-center justify-center gap-6 text-center">
            <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold font-mono">Processing Transaction</h3>
              <p className="text-muted-foreground">Please wait while your request is processed.</p>
            </div>
            <div className="text-sm font-mono bg-muted/50 px-4 py-2 rounded-md">
              Continuing in {adCountdown}...
            </div>
            
            <div className="w-full aspect-video bg-muted/30 border border-border flex flex-col items-center justify-center gap-2 mt-4 relative overflow-hidden group">
               <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono">Advertisement</div>
               <div className="text-xl font-bold opacity-30">Space Reserved</div>
               <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] animate-[shimmer_2s_infinite]"></div>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="py-8 flex flex-col items-center justify-center gap-8 text-center">
            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center border border-green-500/30">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-bold font-mono text-green-500">Success!</h3>
              <p className="text-lg">Sent <span className="font-bold">{claimedAmount} {chain.symbol}</span></p>
            </div>
            
            <div className="w-full bg-muted/30 border border-border rounded-md p-4 text-sm font-mono flex flex-col gap-2 text-left">
              <div className="text-muted-foreground">Transaction Hash</div>
              <div className="truncate flex items-center justify-between">
                <span>{txHash}</span>
                {/* Normally we'd use a real block explorer URL based on chain config */}
                <a href={`#tx-${txHash}`} target="_blank" className="text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            
            <div className="w-full space-y-3 pt-4">
              {chain.buyEnabled && chain.isTestnet && chain.buyUrl && (
                <Button 
                  className="w-full bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50"
                  variant="outline"
                  onClick={() => window.open(chain.buyUrl!, "_blank")}
                >
                  Need more? Buy {chain.symbol}
                </Button>
              )}
              
              <Button onClick={() => handleOpenChange(false)} variant="ghost" className="w-full">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
