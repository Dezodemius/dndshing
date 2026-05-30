import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Loader2,
  UserRound,
  XCircle
} from "lucide-react";

import type {
  CharacterProcessingStepStatus,
  CharacterSummary
} from "@/features/characters/domain";
import {
  CHARACTER_PROCESSING_STAGE_LABELS,
  CHARACTER_PROCESSING_STAGES
} from "@/features/characters/domain";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/shared/utils/cn";

const STEP_STATUS_LABELS = {
  pending: "Ожидает",
  running: "В работе",
  completed: "Готово",
  failed: "Ошибка"
} satisfies Record<CharacterProcessingStepStatus, string>;

function initials(characterName: string) {
  return characterName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function StepIcon({ status }: { status: CharacterProcessingStepStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }

  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }

  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />;
  }

  return <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />;
}

function statusTone(status: CharacterProcessingStepStatus) {
  return cn(
    "text-xs",
    status === "failed" && "text-destructive",
    status === "running" && "text-foreground",
    status === "completed" && "text-muted-foreground",
    status === "pending" && "text-muted-foreground/70"
  );
}

export function CharacterCard({ character }: { character: CharacterSummary }) {
  const canDownloadLss = Boolean(character.generatedJsonPath);
  const canDownloadPdf = Boolean(character.pdfPath);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <Link
          aria-label={`Открыть ${character.characterName}`}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-secondary bg-cover bg-center text-sm font-semibold text-secondary-foreground transition hover:border-foreground/40"
          href={`/characters/${character.id}`}
          style={
            character.avatarUrl
              ? {
                  backgroundImage: `url(${character.avatarUrl})`
                }
              : undefined
          }
        >
          {character.avatarUrl ? null : initials(character.characterName) || <UserRound className="h-6 w-6" />}
        </Link>
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{character.characterName}</CardTitle>
          <p className="mt-1 truncate text-sm text-muted-foreground">{character.playerName}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {character.race} / {character.class}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {CHARACTER_PROCESSING_STAGES.map((stage) => {
            const step = character.processingSteps[stage];

            return (
              <div className="flex items-start gap-2" key={stage}>
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-medium">
                      {CHARACTER_PROCESSING_STAGE_LABELS[stage]}
                    </p>
                    <span className={statusTone(step.status)}>
                      {STEP_STATUS_LABELS[step.status]}
                    </span>
                  </div>
                  {step.message ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {step.message}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-2">
        {canDownloadLss ? (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/characters/${character.id}/download`}>
              <Download className="h-4 w-4" />
              LSS JSON
            </a>
          </Button>
        ) : (
          <Button disabled size="sm" variant="outline">
            <Download className="h-4 w-4" />
            LSS JSON
          </Button>
        )}
        <Button disabled={!canDownloadPdf} size="sm" variant="outline">
          <FileText className="h-4 w-4" />
          PDF
        </Button>
      </CardFooter>
    </Card>
  );
}
