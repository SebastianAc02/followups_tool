"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repartirFollowups } from "./db/repository";

export async function repartirAction(formData: FormData) {
  const owner = String(formData.get("owner") ?? "");
  const porDia = Math.max(1, Math.round(Number(formData.get("porDia") ?? 10)) || 10);
  if (!owner) return;

  repartirFollowups(owner, porDia);

  revalidatePath("/");
  redirect(`/?owner=${encodeURIComponent(owner)}`);
}
