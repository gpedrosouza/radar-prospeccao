import { loginAction } from "./actions";

// searchParams é Promise no Next.js 15
type Props = {
  searchParams: Promise<{ error?: string }>;
};

export const metadata = { title: "Login — Radar Prospecção" };

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "40px 32px",
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 600 }}>
          Radar Prospecção
        </h1>

        {error && (
          <p
            role="alert"
            style={{
              color: "#c0392b",
              background: "#fdf0ef",
              border: "1px solid #f5c6c2",
              borderRadius: 4,
              padding: "10px 12px",
              marginBottom: 20,
              fontSize: 14,
            }}
          >
            {error}
          </p>
        )}

        <form action={loginAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="email" style={{ fontSize: 14, fontWeight: 500 }}>
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              style={{
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="password" style={{ fontSize: 14, fontWeight: 500 }}>
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                fontSize: 14,
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: 8,
              padding: "11px 0",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
