import type { AuthOptions, Session } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/** Comma-separated list of allowed admin emails. */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow whitelisted emails
      if (!user.email || !ADMIN_EMAILS.includes(user.email)) {
        return false;
      }
      return true;
    },
    async session({ session, token }) {
      // Include email in the session
      if (session.user && token.email) {
        session.user.email = token.email;
      }
      return session;
    },
  },
  pages: {
    signIn: "/api/auth/signin",
    error: "/api/auth/error",
  },
};

/** Check whether a session belongs to an admin user. */
export function isAdmin(session: Session | null): boolean {
  if (!session?.user?.email) return false;
  return ADMIN_EMAILS.includes(session.user.email);
}
