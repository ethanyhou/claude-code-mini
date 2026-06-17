import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { execSync, execFileSync } from "child_process";
import { glob } from "glob";
import { dirname, join } from "path";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolDef = Anthropic.Tool;

// ─── Tool definitions ───────────────────────────────────────

export const toolDefinitions: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the contents of a file. Returns the file content with line numbers.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The path to the file to read" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The path to the file to write" },
        content: { type: "string", description: "The content to write to the file" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string match with new content. " +
      "The old_string must match exactly (including whitespace and indentation).",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The path to the file to edit" },
        old_string: { type: "string", description: "The exact string to find and replace" },
        new_string: { type: "string", description: "The string to replace it with" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "insert_into_file",
    description:
      "Insert content into a file at a specific line number without overwriting existing content. " +
      "The content is inserted before the given 1-based line number. " +
      "Use line 1 to prepend, or a number greater than the file's line count to append.",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The path to the file to insert into" },
        line: {
          type: "number",
          description: "The 1-based line number to insert the content before",
        },
        content: { type: "string", description: "The content to insert" },
      },
      required: ["file_path", "line", "content"],
    },
  },
  {
    name: "list_files",
    description: "List files matching a glob pattern. Returns matching file paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: 'Glob pattern (e.g., "**/*.ts", "src/**/*")' },
        path: { type: "string", description: "Base directory to search from. Defaults to cwd." },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep_search",
    description: "Search for a regex pattern in files. Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "The regex pattern to search for" },
        path: { type: "string", description: "Directory or file to search in. Defaults to cwd." },
        include: { type: "string", description: 'File glob pattern to include (e.g., "*.ts")' },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_shell",
    description: "Execute a shell command and return its output. Use for running tests, git, npm, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        timeout: { type: "number", description: "Timeout in ms (default 30000)" },
      },
      required: ["command"],
    },
  },
];

function readFile(input: { file_path: string }): string {
  try {
    const content = readFileSync(input.file_path, "utf-8");
    return content
      .split("\n")
      .map((line, idx) => `${idx + 1}: ${line}`)
      .join("\n");
  } catch (error) {
    console.error(`Error reading file: ${error}`);
    return `Error reading file: ${error}`;
  }
}

function writeFile(input: { file_path: string; content: string }): string {
  try {
    const dir = dirname(input.file_path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(input.file_path, input.content, "utf-8");
    const lineCount = input.content.split("\n").length;
    return `Successfully wrote to ${input.file_path} (${lineCount} lines)`;
  } catch (error) {
    console.error(`Error writing file: ${error}`);
    return `Error writing file: ${error}`;
  }
}

function normalizeQuotes(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'")   // ' ' →
    .replace(/[\u201C\u201D\u2033]/g, '"');   // " " →
}

function findActualString(fileContent: string, searchString: string): string | null {
  if (fileContent.includes(searchString)) return searchString;
  // 用 normalize 后的版本对比
  const normSearch = normalizeQuotes(searchString);
  const normFile = normalizeQuotes(fileContent);
  const idx = normFile.indexOf(normSearch);
  if (idx !== -1) return fileContent.substring(idx, idx + searchString.length);
  return null;
}

function editFile(input: {
  file_path: string;
  old_string: string;
  new_string: string;
}): string {
  try {
    const content = readFileSync(input.file_path, "utf-8");
    const actual = findActualString(content, input.old_string);
    if (!actual) return `Error: old_string not found in ${input.file_path}`;

    const count = content.split(actual).length - 1;
    if (count > 1) return `Error: old_string found ${count} times. Must be unique.`;

    const newContent = content.split(actual).join(input.new_string);
    writeFileSync(input.file_path, newContent);
    return `Successfully edited ${input.file_path}`;
  } catch (e: any) {
    return `Error editing file: ${e.message}`;
  }
}

async function listFiles(input: { pattern: string; path?: string }): Promise<string> {
  try {
    const files = await glob(input.pattern, {
      cwd: input.path || process.cwd(),
      nodir: true,
      ignore: ["node_modules/**", ".git/**"],
    });
    if (files.length === 0) return "No files found.";
    return files.slice(0, 200).join("\n") +
      (files.length > 200 ? `\n... and ${files.length - 200} more` : "");
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

function grepSearch(input: { pattern: string; path?: string; include?: string }): string {
  try {
    const args = ["--line-number", "--color=never", "-r"];
    if (input.include) args.push(`--include=${input.include}`);
    args.push("--", input.pattern);
    args.push(input.path || ".");
    const result = execFileSync("grep", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    });
    const lines = result.split("\n").filter(Boolean);
    return lines.slice(0, 100).join("\n") +
      (lines.length > 100 ? `\n... and ${lines.length - 100} more matches` : "");
  } catch (e: any) {
    if (e.status === 1) return "No matches found.";
    return `Error: ${e.message}`;
  }
}

function runShell(input: { command: string; timeout?: number }): string {
  try {
    const result = execSync(input.command, {
      encoding: "utf-8",
      maxBuffer: 5 * 1024 * 1024,
      timeout: input.timeout || 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result || "(no output)";
  } catch (e: any) {
    const stderr = e.stderr ? `\nStderr: ${e.stderr}` : "";
    return `Command failed (exit code ${e.status})${stderr}`;
  }
}

function insertIntoFile(input: { file_path: string; line: number; content: string }): string {
  try {
    const content = readFileSync(input.file_path, "utf-8");
    const lines = content.split("\n");
    const idx = Math.max(0, Math.min(lines.length, input.line - 1));
    lines.splice(idx, 0, input.content);
    writeFileSync(input.file_path, lines.join("\n"), "utf-8");
    return `Successfully inserted into ${input.file_path} at line ${input.line}`;
  } catch (e: any) {
    return `Error inserting into file: ${e.message}`;
  }
}

const MAX_RESULT_CHARS = 50000;

function truncateResult(result: string): string {
  if (result.length <= MAX_RESULT_CHARS) return result;
  const keepEach = Math.floor((MAX_RESULT_CHARS - 60) / 2);
  return (
    result.slice(0, keepEach) +
    `\n\n[... truncated ${result.length - keepEach * 2} chars ...]\n\n` +
    result.slice(-keepEach)
  );
}

export async function executeTool(
  name: string,
  input: Record<string, any>
): Promise<string> {
  let result: string;
  switch (name) {
    case "read_file":   result = readFile(input as any); break;
    case "write_file":  result = writeFile(input as any); break;
    case "edit_file":   result = editFile(input as any); break;
    case "list_files":  result = await listFiles(input as any); break;
    case "grep_search": result = grepSearch(input as any); break;
    case "run_shell":   result = runShell(input as any); break;
    case "insert_into_file": result = insertIntoFile(input as any); break;
    default: return `Unknown tool: ${name}`;
  }
  return truncateResult(result);
}