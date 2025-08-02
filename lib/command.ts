import { HumanMessage, SystemMessage } from "npm:@langchain/core/messages";
import type { BaseMessage } from "npm:@langchain/core/messages";

import { CommandLineInterface } from "./cli.ts";
import { filesGenerator, parseFileContent } from "./file.ts";
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  autoSave,
  resumeLatestSession,
} from "./session.ts";

/** この会話で使用したLLM モデルの履歴 */
export const modelStack: Set<string> = new Set();

export type _Command =
  | "/help"
  | "/?"
  | "/clear"
  | "/modelStack"
  | "/bye"
  | "/exit"
  | "/quit"
  | "/file"
  | "/save"
  | "/load"
  | "/sessions"
  | "/delete"
  | "/resume-latest";

export enum Command {
  Help = "HELP",
  Clear = "CLEAR",
  ModelStack = "MODELSTACK",
  Bye = "BYE",
  File = "FILE",
  Save = "SAVE",
  Load = "LOAD",
  Sessions = "SESSIONS",
  Delete = "DELETE",
  ResumeLatest = "RESUME_LATEST",
}

// Command 型の型ガード
export const isSlashCommand = (value: unknown): value is Command => {
  if (typeof value === "object" && value !== null && "command" in value) {
    // { command: Command; path: string } の形式の場合は true
    return true;
  }
  return Object.values(Command).includes(value as Command);
};

// Commandに指定したいずれかの数値を返す
export const newSlashCommand = (
  input: string,
): Command | { command: Command; path: string } => {
  const inputParts = input.trim().split(/[\s\n\t]+/);
  const input0 = inputParts[0];
  const commandMap: Record<_Command, Command> = {
    "/help": Command.Help,
    "/?": Command.Help,
    "/clear": Command.Clear,
    "/modelStack": Command.ModelStack,
    "/bye": Command.Bye,
    "/exit": Command.Bye,
    "/quit": Command.Bye,
    "/file": Command.File,
    "/save": Command.Save,
    "/load": Command.Load,
    "/sessions": Command.Sessions,
    "/delete": Command.Delete,
    "/resume-latest": Command.ResumeLatest,
  };
  const command = commandMap[input0 as _Command];
  if (!command) {
    throw new Error(`Invalid command. ${input0}`);
  }

  // Handle special cases for commands that need additional arguments
  if (
    [Command.File, Command.Save, Command.Load, Command.Delete].includes(command) &&
    inputParts.length > 1
  ) {
    return { command, path: inputParts[1] };
  }

  return command;
};

type ModelMessage = { model: string; message: string };

/** ユーザーの入力が@から始まると、@に続くモデル名を返す
 *  @param input {string} : ユーザーの入力
 *  @return {string} モデル名(@に続く文字列)
 */
export const extractAtModel = (input: string): ModelMessage => {
  const match = input.match(/^@[^\s\n\t]+/);
  const model = match ? match[0].substring(1) : "";
  // matchでマッチした@modelName を削除したinput を割り当てる
  const message = match ? input.substring(match[0].length).trim() : input;
  return { model, message };
};

export async function handleSlashCommand(
  commandInput: Command | { command: Command; path: string },
  messages: BaseMessage[],
): Promise<BaseMessage[]> {
  // Handle case where commandInput is a command object with path
  if (typeof commandInput === "object" && "command" in commandInput) {
    const { command, path} = commandInput;

    // Handle /file command
    if (command === Command.File) {
      try {
        // グレーアウトしたテキストを表示
        CommandLineInterface.printGray(
          `Attaching file(s) matching pattern: ${path}...`,
        );

        // ファイルパターンを解釈して全てのマッチするファイルを処理
        let fileCount = 0;
        let allContent = "";

        for await (const filePath of filesGenerator([path])) {
          try {
            const codeBlock = await parseFileContent(filePath);
            if (codeBlock.content) {
              // 各ファイルのコンテンツを追加
              allContent += `${codeBlock.toString()}\n\n`;
              fileCount++;
              CommandLineInterface.printGray(`Attached: ${filePath}`);
            }
          } catch (error) {
            CommandLineInterface.printGrayError(
              `Error processing file ${filePath}: ${error}`,
            );
          }
        }

        if (fileCount > 0) {
          // ファイルが1つ以上添付された場合
          const fileMessage = new HumanMessage(
            `Here are the file(s) I'm attaching (${fileCount} file(s)):\n${allContent.trim()}`,
          );
          messages.push(fileMessage);
          CommandLineInterface.printGray(
            `Successfully attached ${fileCount} file(s)`,
          );
        } else {
          CommandLineInterface.printGray(
            `No files found matching pattern: ${path}`,
          );
        }
      } catch (error) {
        CommandLineInterface.printGrayError(
          `Error processing file pattern ${path}: ${error}`,
        );
      }
      return messages;
    }

    if (command === Command.Save) {
      await saveSession(path, messages, CommandLineInterface.getInstance().params.model);
      console.log(`✅ Session '${path}' saved.`);
      return messages;
    }

    if (command === Command.Load) {
      const { model, messages: loadedMessages } = await loadSession(path);
      console.log(`📂 Session '${path}' loaded with model '${model}'.`);
      modelStack.add(model);
      CommandLineInterface.getInstance().params.model = model;
      return loadedMessages;
    }

    if (command === Command.Delete) {
      await deleteSession(path);
      console.log(`🗑️ Session '${path}' deleted.`);
      return messages;
    }

    // Extract just the command enum for other command types
    commandInput = command;
  }

  // Handle standard commands
  switch (commandInput) {
    case Command.Help: {
      CommandLineInterface.showCommandMessage();
      break; // Slashコマンドを処理したら次のループへ
    }
    case Command.Clear: {
      console.log("Context clear successful");
      // SystemMessage 以外は捨てて新しい配列を返す
      return messages.filter((message: BaseMessage) => {
        if (message instanceof SystemMessage) {
          return message;
        }
      });
    }
    // 使用したモデルの履歴を表示する
    case Command.ModelStack: {
      console.log(`You were chat with them...\n${[...modelStack].join("\n")}`);
      break;
    }
    case Command.Sessions: {
      const sessions = await listSessions();
      console.log("📁 Saved sessions:");
      sessions.forEach(s => console.log(`- ${s}`));
      break;
    }

    case Command.ResumeLatest: {
      const content = await resumeLatestSession();
      if (content) {
        const restored = JSON.parse(content);
        const { model, messages: loadedMessages } = restored;
        console.log(`📂 Resumed latest session with model '${model}'`);
        modelStack.add(model);
        CommandLineInterface.getInstance().params.model = model;
        return loadedMessages;
      } else {
        console.log("⚠️ No session found to resume.");
        return messages;
      }
    }
    case Command.Bye: {
      Deno.exit(0);
    }
  }

  // 自動保存処理
  try {
    const cli = CommandLineInterface.getInstance();
    await autoSave(messages, cli.params.model);
  } catch (error) {
    CommandLineInterface.printGrayError(`AutoSave failed: ${error}`);
  }

  // messagesをそのまま返す
  return messages;
}

/** @が最初につく場合を判定 */
export const isAtCommand = (humanMessage: unknown): boolean => {
  if (!(humanMessage instanceof HumanMessage)) {
    return false;
  }
  const content = humanMessage.content.toString();
  if (!content) {
    return false;
  }
  return content.startsWith("@");
};

function getMessageFromHistory(
  messages: BaseMessage[],
  index: number = -2,
): string | null {
  return messages.length > Math.abs(index)
    ? messages[messages.length + index]?.content.toString()
    : null;
}

export function handleAtCommand(
  humanMessage: HumanMessage,
  messages: BaseMessage[],
  model: string,
): ModelMessage {
  if (!isAtCommand(humanMessage)) {
    return { message: humanMessage.content.toString(), model };
  }

  const extracted = extractAtModel(humanMessage.content.toString());

  // モデル名指定以外のプロンプトがなければ前のプロンプトを引き継ぐ。
  // 前のプロンプトもなければ空のHumanMessageを渡す
  const newMessage: string = extracted.message ||
    getMessageFromHistory(messages) ||
    "";

  return {
    message: newMessage,
    model: extracted.model || model,
  };
}
