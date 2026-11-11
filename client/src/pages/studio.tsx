import { CharacterPromptStudio } from "@/components/character-prompt-studio";

/**
 * STUDIO — Character Prompt Studio (rota /studio).
 * Wrapper de página para o estúdio de prompts do roster completo (32 operativos:
 * 16 militares canônicos + 16 não-militares de milícias e gangues urbanas),
 * permitindo carregamento lazy pela convenção de páginas do app.
 */
export default function Studio() {
  return <CharacterPromptStudio />;
}
