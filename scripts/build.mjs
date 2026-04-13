import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");

const runtimeFiles = [
  "manifest.json",
  "content.js",
  "popup.html",
  "popup.js"
];

const runtimeDirectories = ["icons"];

function cleanDist() {
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
  }
}

function copyRuntimeFiles() {
  runtimeFiles.forEach((file) => {
    cpSync(resolve(rootDir, file), resolve(distDir, file));
  });

  runtimeDirectories.forEach((dir) => {
    cpSync(resolve(rootDir, dir), resolve(distDir, dir), { recursive: true });
  });
}

function buildDist() {
  cleanDist();
  mkdirSync(distDir, { recursive: true });
  copyRuntimeFiles();
  console.log(`Build complete: ${distDir}`);
}

if (process.argv.includes("--clean")) {
  cleanDist();
  console.log(`Clean complete: ${distDir}`);
} else {
  buildDist();
}
