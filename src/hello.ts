import OpenAI from "openai";

// GitHub Models 走 OpenAI 兼容协议
const client = new OpenAI({
  apiKey: process.env.GITHUB_TOKEN,           // 你的 ghp_ token
  baseURL: "https://models.github.ai/inference",
});

const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "read the contents of a file, returns the full text.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The path of the file, format 'path/filename', e.g., 'documents/notes.txt'",
          },
        },
        required: ["location"],
      },
    },
  },
];

async function chat(userMessage: string) {
  // 1. 把用户消息塞进历史
  messages.push({ role: "user", content: userMessage });

  // 2. 调 API（带上整段历史）
  const response = await client.chat.completions.create({
    model: "openai/gpt-4o-mini",
    max_tokens: 1024,
    messages,
  });

  // 3. 把模型响应也塞进历史
  const assistantMessage = response.choices[0].message;
  messages.push(assistantMessage);

  // 4. 输出文本
  console.log(`\nAssistant: ${assistantMessage.content ?? ""}\n`);
}

// 试两轮对话
await chat("我叫小明。");
await chat("我叫什么名字？");