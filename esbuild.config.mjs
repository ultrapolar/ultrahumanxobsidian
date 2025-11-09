import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view"
  ],
  format: "cjs",
  target: "es2018",
  platform: "browser",
  outfile: "main.js",
  sourcemap: process.env.NODE_ENV !== "production"
});

if (isWatch) {
  await context.watch();
  console.log("watching for changes");
} else {
  await context.rebuild();
  await context.dispose();
}
