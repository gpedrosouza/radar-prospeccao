"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    // AuthError = credenciais inválidas ou provider rejeitou
    if (error instanceof AuthError) {
      redirect("/login?error=E-mail+ou+senha+incorretos");
    }
    // Qualquer outro throw é o NEXT_REDIRECT do signIn em caso de sucesso
    // — precisa ser re-propagado para o Next.js processar o redirect
    throw error;
  }
}
