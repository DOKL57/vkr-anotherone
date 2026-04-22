import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Markup, Telegraf, type Context } from "telegraf";
import { z } from "zod";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(moduleDir, "../../../.env"),
  path.resolve(moduleDir, "../../../../.env")
];

for (const candidate of envCandidates) {
  const result = dotenv.config({ path: candidate, override: true });
  if (!result.error && result.parsed) {
    break;
  }
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(1)
    .refine(
      (value) => value !== "replace_me" && /^\d+:[A-Za-z0-9_-]{20,}$/.test(value),
      "TELEGRAM_BOT_TOKEN invalid. Put real token from BotFather into .env."
    ),
  TELEGRAM_WEBAPP_URL: z.string().url(),
  API_URL: z.string().url()
});

const env = envSchema.parse(process.env);
const hasHttpsWebApp = /^https:\/\//i.test(env.TELEGRAM_WEBAPP_URL);
const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
const sessionMap = new Map<number, string>();

const startText = [
  "Склад звука готов.",
  "Можно писать вопрос прямо в чат: например, где есть 2 SM58.",
  "Можно отправить TXT/CSV со списком оборудования."
].join("\n");

function webAppKeyboard() {
  if (!hasHttpsWebApp) {
    return undefined;
  }

  return Markup.inlineKeyboard([
    Markup.button.webApp("Открыть mini app", env.TELEGRAM_WEBAPP_URL)
  ]);
}

async function replyWithOptionalWebApp(ctx: Context, text = startText) {
  const keyboard = webAppKeyboard();
  if (keyboard) {
    await ctx.reply(
      [
        text,
        "Жми кнопку ниже или Menu -> открыть mini app."
      ].join("\n"),
      keyboard
    );
    return;
  }

  await ctx.reply(
    [
      text,
      "Mini app сейчас выключен: нужен публичный HTTPS URL."
    ].join("\n")
  );
}

async function apiJson<T>(pathName: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.API_URL}${pathName}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

bot.start(async (ctx) => {
  await replyWithOptionalWebApp(ctx);
});

bot.command("help", async (ctx) => {
  await replyWithOptionalWebApp(ctx);
});

bot.command("app", async (ctx) => {
  const keyboard = webAppKeyboard();
  if (!keyboard) {
    await ctx.reply("Mini app недоступен: нужен публичный HTTPS URL.");
    return;
  }

  await ctx.reply("Открыть интерфейс:", keyboard);
});

bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) {
    return;
  }

  try {
    const existingSessionId = sessionMap.get(ctx.from.id);
    const response = await apiJson<{ sessionId: string; answer: string }>("/api/ai/query", {
      method: "POST",
      body: JSON.stringify({
        sessionId: existingSessionId ?? null,
        query: ctx.message.text,
        telegramId: String(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name
      })
    });

    sessionMap.set(ctx.from.id, response.sessionId);
    await ctx.reply(response.answer);
  } catch (error) {
    await ctx.reply(`Ошибка AI: ${String(error)}`);
  }
});

bot.on("document", async (ctx) => {
  try {
    const file = await ctx.telegram.getFile(ctx.message.document.file_id);
    if (!file.file_path) {
      throw new Error("Telegram did not return file_path.");
    }

    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Не удалось скачать файл: ${fileResponse.status}`);
    }

    const fileBlob = await fileResponse.blob();
    const formData = new FormData();
    formData.append("file", fileBlob, ctx.message.document.file_name ?? "upload.txt");

    const response = await fetch(`${env.API_URL}/api/uploads/parse-list`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as {
      items: Array<{
        line: string;
        quantity: number;
        match: string | null;
        alternatives: string[];
      }>;
    };

    const answer = data.items
      .map(
        (item) =>
          `${item.line} x ${item.quantity}: ${item.match ?? "совпадений нет"}${
            item.alternatives.length ? ` | похожие: ${item.alternatives.join(", ")}` : ""
          }`
      )
      .join("\n");

    await ctx.reply(answer || "Файл обработан, совпадений нет.");
  } catch (error) {
    await ctx.reply(`Ошибка файла: ${String(error)}`);
  }
});

bot.catch((error) => {
  console.error("Telegram bot runtime error", error);
});

async function configureProfile() {
  const me = await bot.telegram.getMe();
  const tasks: Array<Promise<unknown>> = [
    bot.telegram.setMyCommands([
      { command: "start", description: "Показать приветствие и открыть mini app" },
      { command: "app", description: "Открыть mini app" },
      { command: "help", description: "Как работать с ботом" }
    ]),
    bot.telegram.setMyDescription(
      "Учет звукового оборудования: mini app, AI-ответы в чате, разбор списков TXT/CSV."
    ),
    bot.telegram.setMyShortDescription("Mini app + AI-чат по складу звука.")
  ];

  if (hasHttpsWebApp) {
    tasks.push(
      bot.telegram.setChatMenuButton({
        menuButton: {
          type: "web_app",
          text: "Открыть mini app",
          web_app: { url: env.TELEGRAM_WEBAPP_URL }
        }
      })
    );
  }

  await Promise.all(tasks);
  console.log(`Telegram bot started as @${me.username ?? me.id}`);
}

async function main() {
  if (!hasHttpsWebApp) {
    console.warn(
      "TELEGRAM_WEBAPP_URL is not HTTPS. Mini app button/menu disabled until public HTTPS URL appears."
    );
  }

  await bot.launch();
  await configureProfile();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    bot.stop(signal);
  });
}
