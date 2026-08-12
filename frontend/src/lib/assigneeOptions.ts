/** Build assignee select options with "Assign to myself" first for the logged-in user. */
export function assigneeSelectOptions(
  user: { id: number; full_name?: string; email?: string } | null | undefined,
  people: { id: number; full_name?: string; email?: string }[]
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  if (user?.id) {
    options.push({ value: String(user.id), label: "Assign to myself" });
  }
  for (const p of people) {
    if (user?.id && p.id === user.id) continue;
    options.push({ value: String(p.id), label: p.full_name || p.email || `User ${p.id}` });
  }
  return options;
}
