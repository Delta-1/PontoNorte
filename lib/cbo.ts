export type CboOption = { code: string; title: string };

// Ocupações frequentes para preenchimento rápido. O campo continua aceitando
// qualquer código oficial de seis dígitos informado pelo RH.
export const commonCboOptions: CboOption[] = [
  { code: "142205", title: "Gerente de recursos humanos" },
  { code: "142105", title: "Gerente administrativo" },
  { code: "252105", title: "Administrador" },
  { code: "252405", title: "Analista de desenvolvimento de sistemas" },
  { code: "317110", title: "Desenvolvedor de sistemas de tecnologia da informação" },
  { code: "411005", title: "Auxiliar de escritório" },
  { code: "411010", title: "Assistente administrativo" },
  { code: "414105", title: "Almoxarife" },
  { code: "421125", title: "Operador de caixa" },
  { code: "517410", title: "Porteiro de edifícios" },
  { code: "521110", title: "Vendedor de comércio varejista" },
  { code: "514320", title: "Faxineiro" },
  { code: "782305", title: "Motorista de carro de passeio" },
  { code: "782510", title: "Motorista de caminhão" },
  { code: "322205", title: "Técnico de enfermagem" },
  { code: "223505", title: "Enfermeiro" },
  { code: "225125", title: "Médico clínico" },
];

export const normalizeCbo = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export const formatCbo = (value?: string | null) => {
  const code = normalizeCbo(value ?? "");
  return code.length === 6 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
};

export const cboTitleFor = (code: string) => commonCboOptions.find((item) => item.code === normalizeCbo(code))?.title ?? "";
