export type SexId = "m" | "f";

export type FigureId = "kane" | "puri" | "voss" | "okada" | "hald" | "okonkwo";

export interface FigureDef {
  id: FigureId;
  name: string;
  sex: SexId;
  sexLabel: string;
  origin: string;
  age: number;
  mark: string;
  build: string;
  render: "placa" | "pendente";
}

export const FIGURES: FigureDef[] = [
  {
    id: "kane",
    name: "Idris Kane",
    sex: "m",
    sexLabel: "Masculino",
    origin: "Afro-brasileiro",
    age: 31,
    mark: "Queimadura antiga no pescoço, do lado direito de quem olha.",
    build: "Cabeça raspada, barba rente no maxilar, olhos âmbar.",
    render: "placa",
  },
  {
    id: "puri",
    name: "Yara Puri",
    sex: "f",
    sexLabel: "Feminino",
    origin: "Indígena amazônica",
    age: 27,
    mark: "Marca de nascença redonda sob o olho mais próximo de quem olha.",
    build: "Maçãs altas, cabelo preto liso em coque baixo. Sem pintura, sem adereço.",
    render: "placa",
  },
  {
    id: "voss",
    name: "Leandro Voss",
    sex: "m",
    sexLabel: "Masculino",
    origin: "Levantina",
    age: 34,
    mark: "Nariz quebrado, com calo no dorso.",
    build: "Cabelo escuro crespo curto, barba cerrada, olhos fundos.",
    render: "placa",
  },
  {
    id: "okada",
    name: "Mei Okada",
    sex: "f",
    sexLabel: "Feminino",
    origin: "Nikkei",
    age: 26,
    mark: "Cicatriz fina na têmpora esquerda de quem olha.",
    build: "Corte assimétrico, mais longo do lado direito de quem olha.",
    render: "placa",
  },
  {
    id: "hald",
    name: "Soren Hald",
    sex: "m",
    sexLabel: "Masculino",
    origin: "Norte-europeia",
    age: 29,
    mark: "Sardas densas no nariz e nas maçãs.",
    build: "Pele sardenta, cabelo loiro escuro, olhos claros.",
    render: "placa",
  },
  {
    id: "okonkwo",
    name: "Nia Okonkwo",
    sex: "f",
    sexLabel: "Feminino",
    origin: "África Ocidental",
    age: 33,
    mark: "Heterocromia: olho âmbar à esquerda de quem olha. Diastema.",
    build: "Tranças curtas rente ao couro, pescoço longo.",
    render: "placa",
  },
];

const IDS = new Set<string>(FIGURES.map((figure) => figure.id));

export function isFigureId(value: unknown): value is FigureId {
  return typeof value === "string" && IDS.has(value);
}

export function figureById(id: FigureId): FigureDef {
  const found = FIGURES.find((figure) => figure.id === id);
  if (!found) throw new Error("figura desconhecida");
  return found;
}

export function figureSrc(id: FigureId): string {
  return `/figures/${id}.jpg`;
}
