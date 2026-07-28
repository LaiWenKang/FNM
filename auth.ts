import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Accounts are optional-by-configuration: with Google credentials set, sign-in
// works and (when REQUIRE_AUTH=true) is mandatory. Without them the app still
// runs in guest mode so a fresh deploy is never broken by a missing key.

export const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/** Sign-in is enforced only when it is actually possible. */
export const authRequired = googleConfigured && process.env.REQUIRE_AUTH === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: googleConfigured ? [Google] : [],
  // JWT sessions: the session lives in an encrypted cookie, so sign-in works
  // with no database. The database (when present) stores the taste profile.
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, profile }) {
      // `sub` is the stable Google account id — our user key.
      if (profile?.sub) token.sub = profile.sub;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
