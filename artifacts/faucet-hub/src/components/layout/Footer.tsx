import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto py-8">
      <div className="container mx-auto px-4 flex flex-col gap-6">
        {/* Top row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="ChainDrop" className="w-7 h-7 object-contain" />
            <span className="font-bold text-sm tracking-tight">ChainDrop</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
              About
            </Link>
            <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
              Contact
            </Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
              Terms & Conditions
            </Link>
          </nav>

          <div className="flex items-center gap-4 text-sm">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
              [ X / Twitter ]
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
              [ Telegram ]
            </a>
          </div>
        </div>

        {/* Bottom row */}
        <div className="border-t border-border/50 pt-4 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} ChainDrop. All rights reserved.</p>
          <div className="flex items-center gap-4 font-mono">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <span className="opacity-30">|</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
