import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

const tools: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "read the contents of a file, returns the full text.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path of the file, format 'path/filename', e.g., 'documents/notes.txt'",
        },
      },
      required: ["file_path"],
    },
  },
];

function executeTool(toolName: string, input: any): string {
  if (toolName === "read_file") {
    try {
      return readFileSync(input.file_path, "utf-8");
    } catch (error) {
      console.error(`Error reading file: ${error}`);
      return `Error reading file: ${error}`;
    }
  }
  return `Unknown tool: ${toolName}`;
}

export class Agent {
  // Run the Anthropic protocol through a local copilot-api proxy, backed by your GitHub Copilot subscription.
  // Start the proxy in a separate terminal first (the first run triggers GitHub device login to authorize your Copilot subscription):
  //   npx copilot-api@latest start
  // It listens on http://localhost:4141 by default and exposes the Anthropic-compatible /v1/messages endpoint.
  private client = new Anthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "http://localhost:4141",
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN ?? "dummy",
  });
  private messages: Anthropic.MessageParam[] = [];
  private model: string = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4.6";

  async chat(userMessage: string): Promise<void> {
    this.messages.push({ role: "user", content: userMessage });

    while (true) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        tools,
        messages: this.messages,
      });

      this.messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      for (const block of response.content) {
        if (block.type === "text") process.stdout.write(block.text);
      }

      if (toolUses.length === 0) {
        console.log("\n");
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        console.log(`\n  → ${tu.name}(${JSON.stringify(tu.input)})`);
        const result = executeTool(tu.name, tu.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result.slice(0, 2000),
        });
      }

      this.messages.push({ role: "user", content: toolResults });
    }
  }
}
