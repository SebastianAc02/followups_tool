// Deriva el link a la página real de Notion desde empresa.notionPageId (ya en schema).
// Notion acepta la URL con el id sin guiones al final del path.
export function urlNotion(pageId: string | null | undefined): string | null {
  if (!pageId) return null;
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}
