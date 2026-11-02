import { CharacterPromptStudio } from "@/components/character-prompt-studio";

/**
 * STUDIO — Character Prompt Studio (rota /studio).
 * Wrapper de página para o estúdio de prompts dos 16 operatives canônicos,
 * permitindo carregamento lazy pela convenção de páginas do app.
 */
export default function Studio() {
  return <CharacterPromptStudio />;
}
