"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Native <dialog>. Escape and the close button fire onClose; the parent unmounts
// this component to hide it.
export function Modal({ title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[min(520px,calc(100%-28px))] overflow-auto rounded-[4px] border border-line bg-panel p-7 text-ink shadow-2xl backdrop:bg-ink/35 backdrop:backdrop-blur-sm"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2 id={titleId} className="font-serif text-2xl font-normal">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close"
          className="grid min-h-11 min-w-11 place-items-center text-2xl leading-none text-muted"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
