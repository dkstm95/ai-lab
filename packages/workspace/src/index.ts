export interface Workspace {
  readonly root: string;
}

export function createWorkspace(root: string): Workspace {
  return { root };
}

export function createDefaultWorkspace(): Workspace {
  return createWorkspace(process.env.AI_LAB_WORKSPACE_ROOT ?? process.cwd());
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}
