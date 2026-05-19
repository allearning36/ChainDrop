export function Footer() {
  return (
    <footer className="border-t border-border mt-auto py-8">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono rounded text-xs">
            CD
          </div>
          <span className="font-bold text-sm tracking-tight">ChainDrop</span>
        </div>
        
        <p className="text-sm text-muted-foreground text-center md:text-left">
          &copy; {new Date().getFullYear()} ChainDrop. All rights reserved.
        </p>
        
        <div className="flex items-center gap-4 text-sm">
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
            [ X / Twitter ]
          </a>
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors font-mono">
            [ Telegram ]
          </a>
        </div>
      </div>
    </footer>
  );
}
