// Re-exports of cross-boundary coach types so client code never imports from @/server/.
export type {
  Role,
  ContentBlock,
  StoredMessage,
  ToolName,
  SSEEvent,
  ChatRequestBody,
  BuildRequestBody,
} from "@/server/coach/types";

export type { BuildFormSport, BuildFormGoal, BuildFormInput } from "@/lib/build-form";
