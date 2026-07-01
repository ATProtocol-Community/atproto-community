export function pickFirst<TItem, TValue>({
  items,
  select,
}: {
  items: Array<TItem | null | undefined>;
  select: (item: TItem | null | undefined) => TValue | null | undefined;
}): TValue | null {
  for (const item of items) {
    const value = select(item);
    if (value) {
      return value;
    }
  }

  return null;
}

export function pickFirstActionResult<TResult extends {
  data?: unknown;
  error?: unknown;
}>({
  items,
  hasMeaningfulData,
}: {
  items: Array<TResult | null | undefined>;
  hasMeaningfulData: (
    data: TResult["data"] | null | undefined,
  ) => boolean;
}): TResult | null {
  return pickFirst({
    items,
    select: (item) =>
      hasMeaningfulData(item?.data) || item?.error ? item : null,
  });
}

export type ActionResultLike<TData extends object> = {
  data?: TData | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
} | null | undefined;

interface NoticeMessage {
  tone: "success" | "info" | "neutral" | "error";
  message: string;
}

export function getActionErrorNotice<
  TCode extends string,
  TNotice extends NoticeMessage,
>(
  notices: Record<TCode, TNotice>,
  code?: string,
  message?: string,
): TNotice | { tone: "error"; message: string } | null {
  if (!code) {
    return message ? { tone: "error", message } : null;
  }

  const fallback = notices[code as TCode];
  if (!fallback) {
    return message ? { tone: "error", message } : null;
  }

  return {
    ...fallback,
    message: message || fallback.message,
  };
}

export function isPermissionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeError = error as {
    status?: number;
    error?: string;
    message?: string;
  };
  const text =
    `${maybeError.error ?? ""} ${maybeError.message ?? ""}`.toLowerCase();

  return (
    maybeError.status === 401 ||
    maybeError.status === 403 ||
    text.includes("scope")
  );
}
