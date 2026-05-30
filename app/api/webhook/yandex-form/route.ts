import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { getServerEnv } from "@/shared/config/env";
import { AppError, getErrorMessage } from "@/shared/utils/errors";
import { generateCharacterFromYandexWebhook } from "@/features/webhooks/pipeline";
import { createYandexFormWebhookEnvelope } from "@/features/webhooks/yandex-form.adapter";

function isAuthorized(request: NextRequest, secret?: string) {
  if (!secret) {
    return true;
  }

  const authorization = request.headers.get("authorization");

  return (
    authorization === `Bearer ${secret}` ||
    request.headers.get("x-webhook-secret") === secret ||
    request.headers.get("x-yandex-form-token") === secret
  );
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();

  if (!isAuthorized(request, env.YANDEX_FORM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const envelope = createYandexFormWebhookEnvelope(body, {
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
