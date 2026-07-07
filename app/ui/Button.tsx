import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { button } from "./button.variants.ts";

type ButtonProps = { variant?: "block" | "pill" } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "pill", className, ...props }: ButtonProps) {
  return <button type="button" className={cn(button({ variant }), className)} {...props} />;
}
