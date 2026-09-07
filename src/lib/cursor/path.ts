import fs from "fs";
import os from "os";
import path from "path";

export function getCursorUserDir(): string {
  const home =
    process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();

  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library/Application Support/Cursor/User");
    case "win32": {
      const appData =
        process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
      return path.join(appData, "Cursor", "User");
    }
    default:
      return path.join(home, ".config", "Cursor", "User");
  }
}

export function usesVscdbPathEnv(): boolean {
  return Boolean(process.env.VSCDB_PATH?.trim());
}

export function getDefaultGlobalDbPath(): string {
  return path.join(getCursorUserDir(), "globalStorage", "state.vscdb");
}

export function getResolvedVscdbPath(settingsOverride: string | null): string {
  if (usesVscdbPathEnv()) {
    return path.resolve(process.env.VSCDB_PATH!.trim());
  }
  if (settingsOverride?.trim()) {
    return path.resolve(settingsOverride.trim());
  }
  return getDefaultGlobalDbPath();
}

export function cursorVscdbExists(resolvedPath: string): boolean {
  try {
    return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
  } catch {
    return false;
  }
}

export function cursorVscdbMtimeMs(resolvedPath: string): number {
  try {
    return fs.statSync(resolvedPath).mtimeMs;
  } catch {
    return 0;
  }
}
