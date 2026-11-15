import { ensureSeed } from "@/lib/seed";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

// The login screen is the first unauthenticated touchpoint, so it guarantees
// the demo workspace exists before anyone tries to sign in.
export default async function LoginPage() {
  await ensureSeed();
  return <LoginForm />;
}
