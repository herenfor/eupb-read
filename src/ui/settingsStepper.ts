/**
 * Move an ordered numeric reader setting one step without wrapping bounds.
 *
 * `undefined` means automatic. The caller supplies the value shown by the
 * slider for that state, so stepping follows what the user actually sees. If
 * the requested step would equal that visible default, keep `undefined` so a
 * no-op does not turn automatic into an explicit override.
 */
export function stepSettingValue(
  values: readonly number[],
  current: number | undefined,
  direction: 1 | -1,
  visibleDefault: number,
): number | undefined {
  if (values.length === 0) return current;

  const visibleValue = current ?? visibleDefault;
  const next = direction > 0
    ? values.find((value) => value > visibleValue) ?? values[values.length - 1]
    : [...values].reverse().find((value) => value < visibleValue) ?? values[0];

  return current === undefined && next === visibleDefault ? undefined : next;
}
