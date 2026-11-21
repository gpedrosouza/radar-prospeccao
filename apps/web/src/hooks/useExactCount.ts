"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Contagem exata em background — complementa o count capado (10.000) que a
 * busca síncrona já retorna na hora. Quando a busca vem com countExact:
 * false, o caller dispara requestExactCount(); este hook cria o job (POST
 * /api/cnpj/count-jobs), abre o SSE de progresso e expõe o número real
 * assim que ele chega, sem bloquear a tela nem re-rodar a busca em si.
 */

type CountEvent =
  | { status: "queued" | "active" }
  | { status: "completed"; count: number }
  | { status: "failed"; erro: string };

interface ExactCountState {
  exactCount: number | null;
  isCalculating: boolean;
}

export function useExactCount() {
  const [state, setState] = useState<ExactCountState>({
    exactCount: null,
    isCalculating: false,
  });
  const esRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  /** Cancela qualquer job/stream em andamento e limpa o resultado — chamar antes de uma nova busca. */
  const reset = useCallback(() => {
    closeStream();
    setState({ exactCount: null, isCalculating: false });
  }, [closeStream]);

  const requestExactCount = useCallback(
    async (filtersBody: Record<string, unknown>) => {
      closeStream();
      setState({ exactCount: null, isCalculating: true });

      try {
        const res = await fetch("/api/cnpj/count-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filtersBody),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { jobId } = (await res.json()) as { jobId: string };

        const es = new EventSource(`/api/cnpj/count-jobs/${jobId}/stream`);
        esRef.current = es;

        es.onmessage = (event) => {
          const data = JSON.parse(event.data) as CountEvent;
          if (data.status === "completed") {
            setState({ exactCount: data.count, isCalculating: false });
            closeStream();
          } else if (data.status === "failed") {
            setState({ exactCount: null, isCalculating: false });
            closeStream();
          }
          // queued/active: mantém isCalculating, sem mudar mais nada
        };

        es.onerror = () => {
          // Conexão caiu antes de completar — não sabemos o resultado,
          // silenciosamente volta pro estimado (já exibido pelo caller).
          setState({ exactCount: null, isCalculating: false });
          closeStream();
        };
      } catch {
        setState({ exactCount: null, isCalculating: false });
      }
    },
    [closeStream]
  );

  return { ...state, requestExactCount, reset };
}
