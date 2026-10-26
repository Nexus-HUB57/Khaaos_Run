export type SpecialClassId = "henricks" | "krapulla" | "uryan";

export interface SpecialClassFigure {
  id: SpecialClassId;
  name: string;
  role: string;
  sexLabel: string;
  origin: string;
  age: number;
  mark: string;
  portrait: string;
}

export const SPECIAL_CLASS: SpecialClassFigure[] = [
  {
    id: "henricks",
    name: "Henricks Hunterheads III",
    role: "Marechal",
    sexLabel: "Masculino",
    origin: "Luso-brasileira",
    age: 58,
    mark: "Cicatriz vertical na sobrancelha. Aba do escudo no ombro esquerdo de quem olha.",
    portrait: "/agents/henricks.jpg",
  },
  {
    id: "krapulla",
    name: "King Krapulla",
    role: "Centralizador do Mercado Negro",
    sexLabel: "Masculino",
    origin: "Sul-asiática",
    age: 40,
    mark: "Tinta abstrata no pescoço. Nenhuma cifra legível.",
    portrait: "/agents/krapulla.jpg",
  },
  {
    id: "uryan",
    name: "Uryan Horks",
    role: "Embaixadora",
    sexLabel: "Feminino",
    origin: "Andina",
    age: 36,
    mark: "Linha de queimadura na garganta. Cabelo cortado no queixo.",
    portrait: "/agents/uryan.jpg",
  },
];
