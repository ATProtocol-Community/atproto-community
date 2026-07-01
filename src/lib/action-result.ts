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
