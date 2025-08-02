import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { HumanMessage, AIMessage, SystemMessage } from "npm:@langchain/core/messages";
import type { BaseMessage } from "npm:@langchain/core/messages";

const SESSION_DIR = `${Deno.env.get("HOME")}/.gpt-cli/sessions`;

export async function saveSession(name: string, messages: BaseMessage[], model: string) {
  await ensureDir(SESSION_DIR);
  const path = `${SESSION_DIR}/${name}.json`;
  const data = {
    model,
    messages: messages.map(m => ({ type: m._getType(), content: m.content })),
    timestamp: new Date().toISOString(),
  };
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

export async function loadSession(name: string): Promise<{ model: string; messages: BaseMessage[] }> {
  const path = `${SESSION_DIR}/${name}.json`;
  const raw = await Deno.readTextFile(path);
  const data = JSON.parse(raw);
  const messages = data.messages.map((m: any) => {
    switch (m.type) {
      case "system": return new SystemMessage(m.content);
      case "human": return new HumanMessage(m.content);
      case "ai": return new AIMessage(m.content);
      default: return new HumanMessage(m.content); // fallback
    }
    //if (m.type === "system") return new SystemMessage(m.content);
    //if (m.type === "human") return new HumanMessage(m.content);
    //return new AIMessage(m.content);
  });
  return { model: data.model, messages };
}

export async function listSessions(): Promise<string[]> {
  try {
    const entries = [];
    for await (const entry of Deno.readDir(SESSION_DIR)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        entries.push(entry.name.replace(".json", ""));
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function deleteSession(name: string): Promise<void> {
  const path = `${SESSION_DIR}/${name}.json`;
  await Deno.remove(path);
}

function getMessageType(m: BaseMessage): string {
  if (m instanceof HumanMessage) return "human";
  if (m instanceof AIMessage) return "ai";
  if (m instanceof SystemMessage) return "system";
  return "unknown";
}

export async function autoSave(messages: BaseMessage[], model: string) {
  await ensureDir(SESSION_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `autosave-${timestamp}`;
  const path = `${SESSION_DIR}/${name}.json`;
  const data = {
    model,
    messages: messages.map(m => ({
      type: getMessageType(m),
      //type: m._getType(),
      content: m.content,
    })),
    timestamp: new Date().toISOString(),
  };
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

export async function resumeLatestSession(): Promise<string | null> {
  try {
    let latestFile: string | null = null;
    let latestTime = 0;

    for await (const entry of Deno.readDir(SESSION_DIR)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const filePath = `${SESSION_DIR}/${entry.name}`;
        const stat = await Deno.stat(filePath);
        if (stat.mtime && stat.mtime.getTime() > latestTime) {
          latestTime = stat.mtime.getTime();
          latestFile = filePath;
        }
      }
    }

    if (latestFile) {
      const content = await Deno.readTextFile(latestFile);
      console.log(`✅ Resumed latest session: ${latestFile}`);
      return content;
    } else {
      console.warn("⚠️ No session files found.");
      return null;
    }
  } catch (err) {
    console.error("❌ Failed to resume latest session:", err);
    return null;
  }
}
