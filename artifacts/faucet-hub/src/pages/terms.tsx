import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageRenderer } from "@/components/layout/PageRenderer";
import { Loader2 } from "lucide-react";

interface PageData { slug: string; title: string; content: string; }

export default function TermsPage() {
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pages/terms")
      .then(r => r.json())
      .then((d: PageData) => setPage(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
        ) : page ? (
          <PageRenderer content={page.content} />
        ) : (
          <p className="text-muted-foreground">Page not found.</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
