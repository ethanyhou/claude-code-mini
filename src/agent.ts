import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool} from "./tools";
import { buildSystemPrompt } from "./prompt";
import {
  printAssistantText, printToolCall, printToolResult,
  printCost, printDivider,
} from "./ui.js";
import { randomUUID } from "crypto";
import { saveSession } from "./session";


export class Agent {
  // Run the Anthropic protocol through a local copilot-api proxy, backed by your GitHub Copilot subscription.
  // Start the proxy in a separate terminal first (the first run triggers GitHub device login to authorize your Copilot subscription):
  //   npx copilot-api@latest start
  // It listens on http://localhost:4141 by default and exposes the Anthropic-compatible /v1/messages endpoint.
  private client = new Anthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "http://localhost:4141",
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN ?? "dummy",
  });
  private systemPrompt: string = buildSystemPrompt();
  private messages: Anthropic.MessageParam[] = [];
  private model: string = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4.6";
  private sessionId = randomUUID().slice(0, 8);
  private sessionStartTime = new Date().toISOString();
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  async chat(userMessage: string): Promise<void> {
    this.messages.push({ role: "user", content: userMessage });

    while (true) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools: toolDefinitions,
        messages: this.messages,
      });

      this.totalInputTokens += response.usage?.input_tokens ?? 0;
      this.totalOutputTokens += response.usage?.output_tokens ?? 0;
      this.messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      for (const block of response.content) {
        if (block.type === "text") printAssistantText(block.text);
      }

      if (toolUses.length === 0) {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        printToolCall(tu.name, tu.input as Record<string, any>);
        const result = await executeTool(tu.name, tu.input as Record<string, any>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result.slice(0, 2000),
        });
        printToolResult(tu.name, result);
      }

      this.messages.push({ role: "user", content: toolResults });
    }

    this.autoSave();
    printDivider();
  }

  clearHistory() {
    this.messages = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  showCost() {
    printCost(this.totalInputTokens, this.totalOutputTokens);
  }

  restoreSession(data: { messages: any[] }) {
    this.messages = data.messages;
  }

  private autoSave() {
    try {
      saveSession(this.sessionId, {
        metadata: {
          id: this.sessionId,
          model: this.model,
          cwd: process.cwd(),
          startTime: this.sessionStartTime,
          messageCount: this.messages.length,
        },
        messages: this.messages,
      });
    } catch {}
  }
}
