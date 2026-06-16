import { Agent } from "./agent.js";

const agent = new Agent();
const prompt = process.argv.slice(2).join(" ") || "读 package.json 告诉我项目名";
await agent.chat(prompt);