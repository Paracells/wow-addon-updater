import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExe = resolve(root, "src-tauri/target/release/addon-forge.exe");
const outputDir = resolve(root, "dist/AddonForge-portable");
const outputExe = resolve(outputDir, "Addon Forge.exe");
const zipPath = resolve(root, "dist/AddonForge-portable.zip");

const portableReadme = `Addon Forge - портативная версия
================================

Запуск
------
1. Распакуйте папку AddonForge-portable целиком.
2. Запустите "Addon Forge.exe".

Установка не требуется. Windows SmartScreen может показать предупреждение,
потому что файл не подписан; выберите "Подробнее" -> "Выполнить в любом случае".

Данные
------
Настройки, манифест, загрузки и резервные копии хранятся в папке data рядом
с исполняемым файлом. При переносе приложения переносите папку целиком.

Требования
----------
Windows 10/11 и Microsoft Edge WebView2 Runtime. В актуальных версиях Windows
WebView2 уже установлен. Если приложение не запускается, установите WebView2
Runtime с сайта Microsoft.
`;

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

console.log("Building portable Addon Forge (no installer)...");
execFileSync(
  process.platform === "win32" ? "cargo.exe" : "cargo",
  ["tauri", "build", "--no-bundle", "--features", "portable"],
  {
    cwd: root,
    stdio: "inherit",
  },
);

if (!existsSync(sourceExe)) {
  throw new Error(`Не найден собранный файл: ${sourceExe}`);
}

rmSync(outputDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(outputDir, { recursive: true });
copyFileSync(sourceExe, outputExe);
writeFileSync(resolve(outputDir, "README-portable.txt"), portableReadme, "utf8");

const compressCommand = [
  "$ErrorActionPreference = 'Stop'",
  `Compress-Archive -LiteralPath ${psQuote(outputDir)} -DestinationPath ${psQuote(zipPath)} -Force`,
].join("; ");
execFileSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", compressCommand],
  { stdio: "inherit" },
);

console.log("");
console.log(`Portable executable: ${outputExe}`);
console.log(`Portable archive:    ${zipPath}`);
console.log(`Archive size:        ${formatSize(statSync(zipPath).size)}`);
