import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** Merge class names, letting later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
