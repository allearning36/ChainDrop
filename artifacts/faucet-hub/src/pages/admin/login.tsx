import { useState } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@workspace/api-client-react";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { AlertCircle, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const loginMutation = useAdminAuth();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    
    setErrorMsg("");
    
    loginMutation.mutate({
      data: { password }
    }, {
      onSuccess: (res) => {
        setToken(res.token);
        setLocation("/admin");
      },
      onError: (err: any) => {
        setErrorMsg(err?.data?.error || "Invalid password");
      }
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-[0_0_30px_-10px_rgba(var(--primary),0.3)] bg-card/80 backdrop-blur">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-mono uppercase tracking-tight">Admin Portal</CardTitle>
            <CardDescription className="font-mono">Enter password to access ChainDrop control panel</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Input 
                type="password" 
                placeholder="Terminal Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono bg-background/50 h-12 text-center text-lg tracking-widest"
              />
            </div>
            
            {errorMsg && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-mono text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}
            
            <Button 
              type="submit" 
              className="w-full h-12 font-mono uppercase tracking-widest text-sm"
              disabled={!password || loginMutation.isPending}
            >
              {loginMutation.isPending ? "Authenticating..." : "Access Granted"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center pb-8">
          <Button variant="link" className="text-muted-foreground font-mono text-xs" onClick={() => setLocation("/")}>
            Return to Faucet Hub
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
