import path from "node:path";

export const dataDir = path.join(process.cwd(), "data");
export const uploadRoot = path.join(dataDir, "uploads");

export function pageUploadDir(pageId: string) {
  return path.join(uploadRoot, pageId);
}

export function resolveUploadPath(pageId: string, relativePath: string) {
  const baseDir = pageUploadDir(pageId);
  const normalized = normalizeRelativePath(relativePath || "index.html");
  const fullPath = path.resolve(baseDir, normalized);

  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    throw new Error("Invalid upload path");
  }

  return fullPath;
}

export function normalizeRelativePath(value: string) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .join("/");
}
