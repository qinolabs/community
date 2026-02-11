import { exec } from "node:child_process";

export function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";

  exec(`${cmd} ${url}`, (err) => {
    if (err) {
      console.error(`[qino-lab] Could not open browser: ${err.message}`);
    }
  });
}
