import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { IdeaDocumentMetadata } from "@ai-lab/protocol";

export interface Workspace {
  readonly root: string;
}

export interface CreateIdeaInput {
  readonly title: string;
  readonly source?: string;
  readonly notes?: string;
}

export interface IdeaDocument {
  readonly metadata: IdeaDocumentMetadata;
  readonly path: string;
  readonly content: string;
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

export async function ensureWorkspace(workspace: Workspace): Promise<void> {
  await mkdir(join(workspace.root, "ideas"), { recursive: true });
}

export async function createIdea(
  workspace: Workspace,
  input: CreateIdeaInput,
  now: Date = new Date(),
): Promise<IdeaDocument> {
  await ensureWorkspace(workspace);
  const metadata: IdeaDocumentMetadata = {
    title: input.title,
    slug: slugify(input.title),
    source: input.source,
    createdAt: now.toISOString(),
  };
  const path = join(workspace.root, "ideas", `${metadata.slug}.md`);
  const content = renderIdeaDocument(metadata, input.notes ?? "");
  await writeNewFile(path, content);
  return { metadata, path, content };
}

export async function listIdeas(workspace: Workspace): Promise<IdeaDocument[]> {
  await ensureWorkspace(workspace);
  const ideaDir = join(workspace.root, "ideas");
  const names = (await readdir(ideaDir)).filter((name) => name.endsWith(".md")).sort();
  return Promise.all(
    names.map(async (name) => {
      const path = join(ideaDir, name);
      const content = await readFile(path, "utf8");
      return {
        metadata: metadataFromMarkdown(name, content),
        path,
        content,
      };
    }),
  );
}

function renderIdeaDocument(metadata: IdeaDocumentMetadata, notes: string): string {
  const source = metadata.source ? `source: ${metadata.source}\n` : "";
  return `---\ntitle: ${metadata.title}\nslug: ${metadata.slug}\n${source}createdAt: ${metadata.createdAt}\n---\n\n# ${metadata.title}\n\n## Notes\n\n${notes}\n`;
}

async function writeNewFile(path: string, content: string): Promise<void> {
  try {
    const file = await open(path, "wx");
    try {
      await file.writeFile(content, "utf8");
    } finally {
      await file.close();
    }
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new Error(`Idea already exists: ${path}`);
    }
    throw error;
  }
}

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function metadataFromMarkdown(fileName: string, content: string): IdeaDocumentMetadata {
  const title = content.match(/^title: (.+)$/m)?.[1] ?? fileName.replace(/\.md$/, "");
  const createdAt = content.match(/^createdAt: (.+)$/m)?.[1] ?? new Date(0).toISOString();
  const source = content.match(/^source: (.+)$/m)?.[1];
  return {
    title,
    slug: fileName.replace(/\.md$/, ""),
    source,
    createdAt,
  };
}
