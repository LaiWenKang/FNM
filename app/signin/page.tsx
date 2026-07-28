import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleConfigured, signIn } from "@/auth";
import BrandRow from "@/components/BrandRow";
import TasteRadar from "@/components/TasteRadar";
import { GoogleIcon, ShieldIcon } from "@/components/icons";

// Sign-in. Google is the only provider — one tap, no password to invent.
// Guest mode stays available unless REQUIRE_AUTH is on.

const WATERMARK = { heat: 0.72, sweet: 0.45, soupy: 0.6, fried: 0.55, rich: 0.68, adventure: 0.5 };

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth().catch(() => null);
  if (session?.user) redirect("/");
  const { callbackUrl } = await searchParams;
  const target = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";

  return (
    <main>
      <BrandRow label="Sign in" />
      <div className="hero">
        <div className="headline-wrap">
          <TasteRadar vector={WATERMARK} decorative gid="wmSignin" className="hero-radar" />
          <h1>
            Your palate,
            <br />
            <span className="grad-text">on every device</span>
          </h1>
        </div>
        <p className="sub">
          Sign in so your taste profile, settings and meal history follow you — phone, laptop,
          anywhere.
        </p>

        {googleConfigured ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: target });
            }}
          >
            <button className="big-btn google-btn" type="submit">
              <GoogleIcon size={20} />
              Continue with Google
            </button>
          </form>
        ) : (
          <div className="setting-card">
            <p className="setting-note">
              Google sign-in isn&apos;t configured on this deployment yet. Add{" "}
              <span className="data-num">AUTH_GOOGLE_ID</span>,{" "}
              <span className="data-num">AUTH_GOOGLE_SECRET</span> and{" "}
              <span className="data-num">AUTH_SECRET</span> to enable it — until then the app runs
              in guest mode.
            </p>
          </div>
        )}

        <Link className="hud-chip hud-link" href={target}>
          Continue as guest
        </Link>

        <p className="signin-privacy">
          <ShieldIcon size={13} strokeWidth={1.8} />
          We store your flavour profile and settings — never your contacts, payments or location
          history.
        </p>
      </div>
    </main>
  );
}
