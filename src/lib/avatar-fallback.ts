export interface AvatarFallback {
  initials: string;
  color: string;
}

export function hueFromString(input: string): number {
  let hash = 0;
  for (const character of input) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function initialsFromLabel(label: string): string {
  const segments = label.replace(/^@/, "").split(/[.\-_ ]/);
  const meaningfulSegments = segments.filter(Boolean);
  const initialSegments = meaningfulSegments.slice(0, 2);
  const initials = initialSegments.map(
    (segment) => segment[0]?.toUpperCase() ?? "",
  );
  return initials.join("");
}

export function createAvatarFallback({
  label,
  colorKey = label,
  emptyInitials = "",
}: {
  label: string;
  colorKey?: string;
  emptyInitials?: string;
}): AvatarFallback {
  return {
    initials: initialsFromLabel(label) || emptyInitials,
    color: `oklch(55% 0.12 ${hueFromString(colorKey)})`,
  };
}
