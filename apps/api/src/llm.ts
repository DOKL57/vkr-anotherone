import { env } from "./env.js";

export type LlmIntent = {
  intent: string;
  searchTerms?: string[];
  askFollowup?: boolean;
  question?: string;
  needsAlternatives?: boolean;
};

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as LlmIntent;
  } catch {
    return null;
  }
}

export async function parseIntentWithLlm(message: string, contextText: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  const useOpenRouter = Boolean(env.OPENROUTER_API_KEY);
  const baseUrl = useOpenRouter ? env.OPENROUTER_BASE_URL : env.LOCAL_LLM_URL;
  const model = useOpenRouter ? env.OPENROUTER_MODEL : env.LOCAL_LLM_MODEL;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (useOpenRouter) {
    headers.Authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Ты диспетчер склада звукового оборудования. Верни только JSON с полями intent, searchTerms, askFollowup, question, needsAlternatives. intent: search_equipment, due_returns, repairs, purchases, alternatives, clarify, unknown."
          },
          {
            role: "user",
            content: `Контекст:\n${contextText || "нет"}\n\nЗапрос:\n${message}`
          }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return extractJson(payload.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
