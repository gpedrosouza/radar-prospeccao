import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "banker" | "admin";
    } & DefaultSession["user"];
  }

  interface User {
    role: "banker" | "admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "banker" | "admin";
  }
}
