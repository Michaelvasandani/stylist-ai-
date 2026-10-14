import type { ReactNode } from "react";

export function TopBar({ title, meta, children }: { title: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-4 lg:px-8">
      <div className="flex items-baseline gap-3.5">
        <h1 className="font-serif text-2xl font-normal">{title}</h1>
        {meta && <span className="eyebrow whitespace-nowrap text-taupe">{meta}</span>}
      </div>
      {children}
    </header>
  );
}

export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <>
      <TopBar title={title} />
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="eyebrow text-taupe">Coming next</p>
          <p className="mt-3 max-w-sm font-serif text-2xl italic">{body}</p>
        </div>
      </div>
    </>
  );
}
