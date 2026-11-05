import { redirect } from "next/navigation";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/routes";

/** The proxy sends signed-out visitors to /login before this runs. */
export default function Home() {
  redirect(DEFAULT_SIGNED_IN_PATH);
}
