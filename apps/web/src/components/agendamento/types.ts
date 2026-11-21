export interface SlotDisponivel {
  inicio: string; // ISO 8601
  fim: string; // ISO 8601
}

export interface DadosLead {
  nome: string;
  email: string;
  telefone: string;
}

export interface ResultadoAgendamento {
  inicio: string;
  fim: string;
  googleMeetLink: string | null;
  email: string;
}
