import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/auth-credentials";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      schoolId: string | null;
      roles: Role[];
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // a school day
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      // "identifier" not "email": a teacher may know only their phone number.
      credentials: {
        identifier: { label: "Email or mobile", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const identifier = String(raw?.identifier ?? "");
        const password = String(raw?.password ?? "");
        return verifyCredentials(identifier, password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.schoolId = (user as { schoolId?: string | null }).schoolId ?? null;
        token.roles = (user as { roles?: Role[] }).roles ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.schoolId = (token.schoolId as string | null) ?? null;
      session.user.roles = (token.roles as Role[]) ?? [];
      return session;
    },
  },
});
