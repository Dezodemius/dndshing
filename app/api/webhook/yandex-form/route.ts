import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { getServerEnv } from "@/shared/config/env";
import { AppError, getErrorMessage } from "@/shared/utils/errors";
import { generateCharacterFromYandexWebhook } from "@/features/webhooks/pipeline";
import { normalizeYandexFormWebhookPayload } from "@/features/webhooks/yandex-form.adapter";

function isAuthorized(request: NextRequest) {
  const secret = getServerEnv().YANDEX_FORM_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const payload = normalizeYandexFormWebhookPayload(body, {
      folderId: request.nextUrl.searchParams.get("folderId") ?? request.headers.get("x-folder-id"),
      userId: request.nextUrl.searchParams.get("userId") ?? request.headers.get("x-user-id"),
      deliveryId:
        request.headers.get("x-delivery-id") ??
        request.nextUrl.searchParams.get("deliveryId")
    });
    const result = await generateCharacterFromYandexWebhook(payload);

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
