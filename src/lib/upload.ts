import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/prisma";
import { newId, newSlug } from "@/lib/slug";
import { normalizeRelativePath, pageUploadDir } from "@/lib/paths";

export const maxHtmlBytes = 10 * 1024 * 1024;
export const maxZipBytes = 50 * 1024 * 1024;

type UploadKind = "html" | "zip";

export class UploadError extends Error {
  status = 400;
}

function fail(message: string): never {
  throw new UploadError(message);
}

function detectKind(file: File): UploadKind {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".zip")) return "zip";
  fail("Only .html, .htm, and .zip uploads are supported.");
}

function assertSize(file: File, kind: UploadKind) {
  const limit = kind === "html" ? maxHtmlBytes : maxZipBytes;
  if (file.size <= 0) fail("The uploaded file is empty.");
  if (file.size > limit) {
    fail(`${kind.toUpperCase()} uploads must be smaller than ${limit / 1024 / 1024}MB.`);
  }
}

function validateArchivePath(rawPath: string) {
  const normalized = normalizeRelativePath(rawPath);
  const parts = normalized.split("/").filter(Boolean);

  if (!normalized || path.isAbsolute(rawPath) || rawPath.includes("\\")) {
    fail("ZIP contains an invalid path.");
  }

  if (parts.some((part) => part === ".." || part.startsWith("."))) {
    fail("ZIP paths cannot contain parent or hidden path segments.");
  }

  if (parts.includes("__MACOSX")) {
    return null;
  }

  return normalized;
}

function findEntryPath(paths: string[]) {
  if (paths.includes("index.html")) return "index.html";

  const candidates = paths.filter((entryPath) => {
    const parts = entryPath.split("/");
    return parts.length === 2 && parts[1].toLowerCase() === "index.html";
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) fail("ZIP contains multiple first-level index.html files.");
  fail("ZIP must contain index.html at the root or one folder deep.");
}

function extractTitle(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]
    ?.replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();

  return title || fallback.replace(/\.(html?|zip)$/i, "") || "Untitled page";
}

async function writeSingleHtml(file: File, pageId: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = pageUploadDir(pageId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), bytes);

  return {
    entryPath: "index.html",
    title: extractTitle(bytes.toString("utf8"), file.name),
  };
}

async function writeZip(file: File, pageId: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = pageUploadDir(pageId);
  const archive = new AdmZip(bytes);
  const writableEntries: Array<{ path: string; buffer: Buffer }> = [];
  const htmlByPath = new Map<string, string>();

  for (const entry of archive.getEntries()) {
    if (entry.isDirectory) continue;
    const normalized = validateArchivePath(entry.entryName);
    if (!normalized) continue;

    const buffer = entry.getData();
    writableEntries.push({ path: normalized, buffer });
    if (normalized.toLowerCase().endsWith(".html")) {
      htmlByPath.set(normalized, buffer.toString("utf8"));
    }
  }

  if (writableEntries.length === 0) fail("ZIP does not contain any files.");

  const entryPath = findEntryPath(writableEntries.map((entry) => entry.path));

  await fs.mkdir(dir, { recursive: true });
  for (const entry of writableEntries) {
    const target = path.resolve(dir, entry.path);
    if (!target.startsWith(dir + path.sep)) fail("ZIP contains an invalid path.");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.buffer);
  }

  return {
    entryPath,
    title: extractTitle(htmlByPath.get(entryPath) ?? "", file.name),
  };
}

export async function createPageFromUpload(file: File) {
  const kind = detectKind(file);
  assertSize(file, kind);

  const pageId = newId();
  const dir = pageUploadDir(pageId);

  try {
    const written =
      kind === "html" ? await writeSingleHtml(file, pageId) : await writeZip(file, pageId);

    return await prisma.page.create({
      data: {
        id: pageId,
        slug: newSlug(),
        title: written.title,
        entryPath: written.entryPath,
        uploadType: kind,
        originalName: file.name,
      },
    });
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}
