const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const roots = ["README.md", "LICENSE", "package.json", "src", "scripts", ".github"];
const textExtensions = new Set([".css", ".cs", ".html", ".js", ".json", ".md", ".ps1"]);
const emojiPattern = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u2600-\u27BF]/gu;
const findings = [];

function inspect(target) {
  const absolutePath = path.join(projectRoot, target);
  if (!fs.existsSync(absolutePath)) return;

  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(absolutePath)) {
      inspect(path.join(target, child));
    }
    return;
  }

  if (!textExtensions.has(path.extname(target).toLowerCase())) return;

  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const matches = [...line.matchAll(emojiPattern)].map((match) => match[0]);
    if (matches.length > 0) {
      findings.push(`${target}:${index + 1} contains emoji: ${matches.join(" ")}`);
    }
  });
}

roots.forEach(inspect);

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Text check passed: no emoji found in project files.");
}
