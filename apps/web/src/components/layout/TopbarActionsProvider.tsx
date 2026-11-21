"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface Ctx {
  actions: ReactNode;
  setActions: (a: ReactNode) => void;
}

const TopbarActionsCtx = createContext<Ctx>({ actions: null, setActions: () => {} });

export function TopbarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <TopbarActionsCtx.Provider value={{ actions, setActions }}>
      {children}
    </TopbarActionsCtx.Provider>
  );
}

export function useTopbarActions() {
  return useContext(TopbarActionsCtx);
}
