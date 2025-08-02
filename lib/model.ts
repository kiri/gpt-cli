/**
 * 特定企業に依存したクローズドモデルのLLMインスタンスを生成する関数を定義します。
 * その呼出元modelMapを公開します。
 *
 * # モデルの追加の仕方
 *
 * 1.  対応するLangChainのモデルのimportを追加します。
 *     例: `import { ChatHogeHoge } from "npm:@langchain/hoge-hoge";`
 * 2.  `CloseModel` 型に、追加したモデルの型を追加します。
 *     例: `| ChatHogeHoge;`
 * 3.  モデルのインスタンスを生成する関数を作成します。
 *     - Paramsを受け取り、LangChainのモデルを返す関数
 *     例:
 *     ```typescript
 *     const createHogeHogeInstance = (params: Params): ChatHogeHoge => {
 *       return new ChatHogeHoge({
 *         modelName: params.model,
 *         temperature: params.temperature,
 *         maxTokens: params.maxTokens,
 *       });
 *     };
 *     ```
 * 4.  `modelMap` に、モデルを識別するためのキーと、3で作成した関数を登録します。
 *     - キーは、モデル名にマッチする正規表現です。
 *     例: `"^hoge": createHogeHogeInstance,`
 */
import { ChatOpenAI } from "npm:@langchain/openai";
import { ChatAnthropic } from "npm:@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "npm:@langchain/google-genai";
import { ChatXAI } from "npm:@langchain/xai";
import { AzureChatOpenAI } from "npm:@langchain/openai";

import { Params } from "./params.ts";

export type CloseModel =
  | ChatOpenAI
  | ChatAnthropic
  | ChatGoogleGenerativeAI
  | ChatXAI
  | AzureChatOpenAI;

type ModelMap = { [key: string]: (params: Params) => CloseModel };

const createOpenAIInstance = (params: Params): ChatOpenAI => {
  return new ChatOpenAI({
    modelName: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
};

const createOpenAIOModelInstance = (params: Params): ChatOpenAI => {
  return new ChatOpenAI({
    modelName: params.model,
    temperature: params.temperature,
    // max_completion_tokens: params.maxTokens,
  });
};

const createAnthropicInstance = (params: Params): ChatAnthropic => {
  return new ChatAnthropic({
    modelName: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
};

const createGoogleGenerativeAIInstance = (
  params: Params,
): ChatGoogleGenerativeAI => {
  return new ChatGoogleGenerativeAI({
    model: params.model,
    temperature: params.temperature,
    maxOutputTokens: params.maxTokens,
  });
};

const createXAIInstance = (params: Params): ChatXAI => {
  return new ChatXAI({
    model: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
};

/*const createAzureOpenAIInstance = (params: Params): AzureChatOpenAI => {
  return new AzureChatOpenAI({
    azureOpenAIApiKey: params.apiKey,           // 追加で必要なフィールド
    azureOpenAIApiVersion: params.apiVersion,   // 追加で必要なフィールド
    azureOpenAIEndpoint: params.endpoint,       // 追加で必要なフィールド
    deploymentName: params.model,               // モデル名は deploymentName にマップ
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
};*/
export const createAzureOpenAIInstance = (params: Params): AzureChatOpenAI => {
  const deploymentName = params.model.startsWith("azure-")
    ? params.model.slice("azure-".length)
    : params.model;

  return new AzureChatOpenAI({
    azureOpenAIApiKey: params.apiKey,
    azureOpenAIApiVersion: params.apiVersion,
    azureOpenAIEndpoint: params.endpoint,
    deploymentName,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
};

export const modelMap: ModelMap = {
  "^gpt": createOpenAIInstance,
  "^o[0-9]": createOpenAIOModelInstance,
  "^claude": createAnthropicInstance,
  "^gem": createGoogleGenerativeAIInstance,
  "^grok": createXAIInstance,
  "^azure": createAzureOpenAIInstance, // ← 追加
} as const;
