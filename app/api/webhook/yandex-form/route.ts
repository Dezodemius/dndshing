import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { getServerEnv } from "@/shared/config/env";
import { AppError, getErrorMessage } from "@/shared/utils/errors";
import { generateCharacterFromYandexWebhook } from "@/features/webhooks/pipeline";
import { createYandexFormWebhookEnvelope } from "@/features/webhooks/yandex-form.adapter";

function isAuthorized(request: NextRequest, secret?: string) {
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization");

  return (
    authorization === `Bearer ${secret}` ||
    request.headers.get("x-webhook-secret") === secret ||
    request.headers.get("x-yandex-form-token") === secret
  );
}

type ParsedWebhookBody = {
  rawText: string;
  body: unknown;
};

async function parseWebhookBody(request: NextRequest): Promise<ParsedWebhookBody> {
  const text = (await request.text()).trim();

  if (!text) {
    throw new AppError("Webhook request body is empty.", 400);
  }

  const parsed = tryParseJson(text);

  if (parsed.ok) {
    return {
      rawText: text,
      body: unwrapNestedJsonString(parsed.value)
    };
  }

  const unescapedJson = text.replace(/\\"/g, "\"");
  const parsedUnescaped = tryParseJson(unescapedJson);

  if (parsedUnescaped.ok) {
    return {
      rawText: text,
      body: unwrapNestedJsonString(parsedUnescaped.value)
    };
  }

  const formPayload = parseFormEncodedJson(text);

  if (formPayload !== null) {
    return {
      rawText: text,
      body: formPayload
    };
  }

  return {
    rawText: text,
    body: text
  };
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: SyntaxError } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, error };
    }

    throw error;
  }
}

function unwrapNestedJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!looksLikeJson(trimmed)) {
    return value;
  }

  const parsed = tryParseJson(trimmed);

  return parsed.ok ? parsed.value : value;
}

function parseFormEncodedJson(text: string): unknown | null {
  const params = new URLSearchParams(text);

  for (const key of ["payload", "body", "json", "data"]) {
    const value = params.get(key);

    if (!value) {
      continue;
    }

    const parsed = tryParseJson(value);

    if (parsed.ok) {
      return unwrapNestedJsonString(parsed.value);
    }
  }

  return null;
}

function looksLikeJson(value: string): boolean {
  return (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  );
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();

  if (!isAuthorized(request, env.YANDEX_FORM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsedBody = await parseWebhookBody(request);
    const envelope = createYandexFormWebhookEnvelope(parsedBody.body, {
      rawText: parsedBody.rawText,
      folderId:
        request.nextUrl.searchParams.get("folderId") ??
        request.headers.get("x-folder-id") ??
        env.WEBHOOK_DEFAULT_FOLDER_ID,
      userId:
        request.nextUrl.searchParams.get("userId") ??
        request.headers.get("x-user-id") ??
        env.WEBHOOK_DEFAULT_USER_ID,
      deliveryId:
        request.headers.get("x-delivery-id") ??
        request.headers.get("x-form-answer-id") ??
        request.nextUrl.searchParams.get("deliveryId")
    });
    const result = await generateCharacterFromYandexWebhook(envelope);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid webhook payload",
          details: error.flatten()
        },
        { status: 400 }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
