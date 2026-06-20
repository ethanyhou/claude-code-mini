#!/usr/bin/env node
import * as readline from "readline";
import { Agent } from "./agent.js";
import { printWelcome, printUserPrompt, printError, printInfo } from "./ui.js";
import { loadSession, getLatestSessionId } from "./session.js";

interface ParsedArgs {
  model: string;
  resume: boolean;
  prompt?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let model: string = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4.6";
  let resume = process.env.npm_config_resume === "true";
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" || args[i] === "-m") {
      model = args[++i] || model;
    } else if (args[i] === "--resume") {
      resume = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`Usage: mini-claude [--model X] [--resume] [prompt]`);
      process.exit(0);
    } else {
      positional.push(args[i]);
    }
  }

  return {
    model, resume,
    prompt: positional.length > 0 ? positional.join(" ") : undefined,
  };
}

async function runRepl(agent: Agent) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let sigintCount = 0;
  process.on("SIGINT", () => {
    sigintCount++;
    if (sigintCount >= 2) {
      console.log("\nBye!\n");
      process.exit(0);
    }
    console.log("\n  Press Ctrl+C again to exit.");
    printUserPrompt();
  });

  printWelcome();

  // 注意：用 rl.once 而不是 rl.on,保证严格串行,避免并发的 chat 同时改 messages
  const askQuestion = (): void => {
    printUserPrompt();
    rl.once("line", async (line) => {
      const input = line.trim();
      sigintCount = 0;

      if (!input) { askQuestion(); return; }
      if (input === "exit" || input === "quit") {
        console.log("\nBye!\n"); process.exit(0);
      }
      if (input === "/clear") { agent.clearHistory(); askQuestion(); return; }
      if (input === "/cost")  { agent.showCost();     askQuestion(); return; }

      try {
        await agent.chat(input);
      } catch (e: any) {
        printError(e.message);
      }
      askQuestion();
    });
  };

  askQuestion();
}

async function main() {
  const { model, prompt, resume } = parseArgs();

  const agent = new Agent();
  // (后续章节会让 Agent 接收 model/permissionMode 等参数；先用默认)

  if (resume) {
    console.log("Looking for latest session...");
    const id = getLatestSessionId();
    if (id) {
      const s = loadSession(id);
      if (s) {
        agent.restoreSession({ messages: s.messages });
        printInfo(`Resumed session ${id} (${s.metadata.messageCount} messages).`);
      }
    } else {
      printInfo("No previous session to resume.");
    }
  }

  if (prompt) {
    await agent.chat(prompt);
  } else {
    await runRepl(agent);
  }
}

main();
