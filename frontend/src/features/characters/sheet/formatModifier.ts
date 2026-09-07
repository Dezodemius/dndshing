export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}
