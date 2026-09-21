import Anthropic from "@anthropic-ai/sdk";
import * as mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { env } from "./env";
import { MODEL, REFUSAL_FALLBACK_BETA } from "./summarize";

/** Max characters we keep per uploaded file. Enough for a long doc, small enough to stay cheap. */
const MAX_CHARS = 20_000;

export type ExtractedFile = { name: string; mimeType: string; text: string; chars: number };

type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const IMAGE_TYPES = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Turns an uploaded file into plain text the strategist can read. */
export async function extractText(file: File): Promise<ExtractedFile> {
  const name = file.name || "upload";
  const mimeType = file.type || guessType(name);
  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name)) {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (mimeType.includes("wordprocessingml") || /\.docx$/i.test(name)) {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (IMAGE_TYPES.has(mimeType)) {
    text = await describeImage(buffer.toString("base64"), mimeType as ImageType);
  } else if (mimeType.startsWith("text/") || /\.(txt|md|markdown|csv|json)$/i.test(name)) {
    text = buffer.toString("utf8");
  } else {
    throw new Error(`We cannot read "${name}" yet. Send a PDF, Word document, text file or image.`);
  }

  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS).trimEnd() + "\n\n[cut off here to keep it short]";
  if (!text) throw new Error(`"${name}" had no readable text in it.`);
  return { name, mimeType, text, chars: text.length };
}

function guessType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      md: "text/markdown",
      csv: "text/csv",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    }[ext] ?? "application/octet-stream"
  );
}

/** For screenshots, slides, whiteboard photos: transcribe the text and describe what is shown. */
async function describeImage(base64: string, mediaType: ImageType): Promise<string> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing. Paste it into the .env file, then try again.");
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({ apiKey, defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: [REFUSAL_FALLBACK_BETA],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: "First transcribe every word of visible text exactly as written, in reading order. Then, on a new line starting with 'What it shows:', describe the image in two plain sentences. No other commentary.",
          },
        ],
      },
    ],
  });
  return response.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
