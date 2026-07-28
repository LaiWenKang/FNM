import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleConfigured, signIn } from "@/auth";
import BrandRow from "@/components/BrandRow";
import Togo from "@/components/Togo";
import { GoogleIcon, ShieldIcon } from "@/components/icons";
import { togoLine } from "@/lib/togoLines";

// Sign-in. Google is the only provider — one tap, no password to invent.
// Guest mode stays available unless REQUIRE_AUTH is on.
//
// Accounts becoming mandatory is the app's biggest new friction point, and a
// face plus a REASON is the cheapest mitigation available. He states what the
// account BUYS — the route is remembered — rather than what the app wants. No
// props: he has no hands and never holds anything.

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
    <main className="signin">
      <BrandRow label="Sign in" />

      <div className="signin-card mat mat-thick" style={{ ["--card-i" as string]: 0 }}>
        {/* the aurora is anchored BEHIND this card rather than smeared across
            the whole viewport, so the light reads as emitted, not painted */}
        <span className="signin-aura" aria-hidden="true" />

        <Togo variant="bust" mood="harnessed" size={104} gid="si" className="signin-togo togo-face" />

        {/* ONE HEADLINE. His line at 17/700 immediately above a 34px h1 was two
            competing headline statements stacked; he is the supporting voice
            underneath it, which is his job everywhere else in the product. */}
        <h1>
          Your palate,
          <br />
          <span className="grad-text">on every device</span>
        </h1>
        <p className="signin-say togo-say">{togoLine("signin")}</p>
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
          <p className="signin-unconfigured">Google sign-in is not enabled on this deployment.</p>
        )}

        <Link className="hud-chip hud-link signin-guest" href={target}>
          Continue as guest
        </Link>

        <p className="signin-small">Your palate stays yours.</p>
      </div>

      {/* A DEPLOYMENT NOTICE IS NOT MARKETING COPY. It used to sit as body text
          in the middle of the conversion card; it is now a mono footnote under
          it, in the engineering voice, where an engineer will still find it. */}
      {!googleConfigured && (
        <p className="deploy-note">
          Set <span className="data-num">AUTH_GOOGLE_ID</span> ·{" "}
          <span className="data-num">AUTH_GOOGLE_SECRET</span> ·{" "}
          <span className="data-num">AUTH_SECRET</span> to enable Google
        </p>
      )}

      <p className="signin-privacy">
        <ShieldIcon size={13} strokeWidth={1.8} />
        We store your flavour profile and settings — never your contacts, payments or location
        history.
      </p>
    </main>
  );
}
