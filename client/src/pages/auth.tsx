import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, Flame, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register" | "forgot" | "resend" | "reset";
type ApiResult = { message?: string; user?: { id: string; email: string; firstName: string | null; lastName: string | null } };

async function postAuth(path: string, payload: Record<string, string>): Promise<ApiResult> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as ApiResult;
  if (!response.ok) throw new Error(result.message || "Não foi possível concluir a solicitação.");
  return result;
}

const copy: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  login: { title: "Acesse sua conta", subtitle: "Entre no War'I com email e senha ou use seu provedor de identidade.", submit: "ENTRAR" },
  register: { title: "Aliste-se na plataforma", subtitle: "Crie sua conta. A confirmação do email é necessária antes do primeiro acesso.", submit: "CRIAR CONTA" },
  forgot: { title: "Recuperar acesso", subtitle: "Enviaremos um link seguro se houver uma conta elegível para esse email.", submit: "ENVIAR LINK" },
  resend: { title: "Confirmar email", subtitle: "Solicite novamente a confirmação para uma conta ainda não verificada.", submit: "REENVIAR CONFIRMAÇÃO" },
  reset: { title: "Defina uma nova senha", subtitle: "Escolha uma senha com pelo menos 12 caracteres.", submit: "SALVAR NOVA SENHA" },
};

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>(() => new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login");
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const verificationToken = fragment.get("verify");
    const resetToken = fragment.get("reset");
    if (!verificationToken && !resetToken) return;
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);
    if (resetToken) {
      setToken(resetToken);
      setMode("reset");
      return;
    }
    setMode("login");
    setBusy(true);
    postAuth("/api/auth/verify-email", { token: verificationToken! })
      .then((result) => setNotice({ text: result.message || "Email confirmado. Você já pode entrar." }))
      .catch((error) => setNotice({ text: error instanceof Error ? error.message : "Link inválido ou expirado.", error: true }))
      .finally(() => setBusy(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    try {
      if (mode === "register") {
        await postAuth("/api/auth/register", {
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          password,
          confirmPassword,
        });
        setNotice({ text: "Se o cadastro puder ser iniciado, enviaremos as instruções de confirmação ao email informado." });
        setMode("login");
      } else if (mode === "login") {
        await postAuth("/api/auth/login", { email: String(form.get("email") || ""), password });
        window.location.assign("/");
      } else if (mode === "forgot") {
        const result = await postAuth("/api/auth/password-reset/request", { email: String(form.get("email") || "") });
        setNotice({ text: result.message || "Se houver uma conta elegível, enviaremos instruções." });
      } else if (mode === "resend") {
        const result = await postAuth("/api/auth/resend-verification", { email: String(form.get("email") || "") });
        setNotice({ text: result.message || "Se houver uma conta pendente, enviaremos instruções." });
      } else {
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");
        const result = await postAuth("/api/auth/password-reset/complete", { token, password, confirmPassword });
        setNotice({ text: result.message || "Senha redefinida. Entre usando a nova senha." });
        setMode("login");
      }
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message.replace(/^\d+:\s*/, "") : "Falha ao enviar. Tente novamente.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const formCopy = copy[mode];
  const needsEmail = mode !== "reset";
  const needsPassword = mode === "register" || mode === "login" || mode === "reset";
  const needsConfirm = mode === "register" || mode === "reset";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_35%,rgba(100,20,160,0.2),transparent_55%),radial-gradient(ellipse_at_80%_65%,rgba(180,60,5,0.15),transparent_50%),radial-gradient(circle_at_50%_100%,rgba(60,10,100,0.35),rgba(8,5,15,1)_70%)]" />
      <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(200,80,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(200,80,20,0.04) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8">
        <Link href="/" className="inline-flex w-fit items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> VOLTAR AO WAR'I
        </Link>
        <div className="my-auto grid items-center gap-12 py-12 lg:grid-cols-[1fr_0.85fr]">
          <section className="max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-xs tracking-[0.25em] text-primary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> ACESSO AO SISTEMA
            </div>
            <h1 className="mb-5 font-display text-5xl font-black tracking-tight text-transparent md:text-7xl" style={{ backgroundImage: "linear-gradient(180deg,hsl(40 90% 80%),hsl(25 95% 55%) 55%,hsl(10 80% 35%))", backgroundClip: "text" }}>KHAAOS RUN</h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">Identidade protegida, email confirmado e acesso à plataforma. O cadastro da conta é separado do alistamento e de qualquer pagamento.</p>
            <div className="mt-8 flex items-center gap-3 font-mono text-xs tracking-widest text-muted-foreground"><ShieldCheck className="h-5 w-5 text-primary" /> CONEXÃO DE CONTA PROTEGIDA</div>
          </section>

          <section className="w-full max-w-lg justify-self-center border border-primary/20 bg-black/50 p-6 shadow-[0_20px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur md:p-9">
            <div className="mb-7">
              <div className="mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-primary"><Flame className="h-4 w-4" /> PORTAL DO JOGADOR</div>
              <h2 className="font-display text-2xl font-bold tracking-wide">{formCopy.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{formCopy.subtitle}</p>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === "register" && <Field label="Nome" name="name" autoComplete="name" maxLength={80} required />}
              {needsEmail && <Field label="Email" name="email" type="email" autoComplete={mode === "login" ? "email" : "email"} value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />}
              {needsPassword && <Field label={mode === "reset" ? "Nova senha" : "Senha"} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 12} maxLength={128} required />}
              {needsConfirm && <Field label="Confirmar senha" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />}
              {mode === "reset" && <p className="text-xs text-muted-foreground">Use pelo menos 12 caracteres. O link é de uso único e expira após 30 minutos.</p>}
              {notice && <div role="status" className={`border px-3 py-3 text-sm ${notice.error ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/5 text-foreground"}`}>{notice.text}</div>}
              <Button className="w-full font-display tracking-[0.16em]" size="lg" type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{formCopy.submit}
              </Button>
            </form>

            <div className="mt-6 space-y-3 text-center text-sm">
              {mode === "login" && <>
                <button type="button" onClick={() => { setMode("forgot"); setNotice(null); }} className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Esqueci minha senha</button>
                <div><button type="button" onClick={() => { setMode("resend"); setNotice(null); }} className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Reenviar confirmação de email</button></div>
                <div className="relative my-5"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div><span className="relative bg-black px-3 text-xs text-muted-foreground">OU</span></div>
                <a href="/api/login" className="inline-flex min-h-10 w-full items-center justify-center border border-white/20 px-4 font-mono text-xs tracking-widest transition-colors hover:border-primary/60 hover:text-primary">CONTINUAR COM PROVEDOR DE IDENTIDADE</a>
                <p className="pt-2 text-muted-foreground">Ainda não tem conta? <button type="button" onClick={() => { setMode("register"); setNotice(null); }} className="font-semibold text-primary hover:underline">Criar conta</button></p>
              </>}
              {mode === "register" && <p className="text-muted-foreground">Já tem conta? <button type="button" onClick={() => { setMode("login"); setNotice(null); }} className="font-semibold text-primary hover:underline">Entrar</button></p>}
              {(mode === "forgot" || mode === "resend" || mode === "reset") && <button type="button" onClick={() => { setMode("login"); setNotice(null); }} className="font-semibold text-primary hover:underline">Voltar ao login</button>}
            </div>
          </section>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      </div>
    </main>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, name, className, ...inputProps } = props;
  const id = `auth-${name}`;
  return (
    <div className="space-y-2 text-left">
      <label htmlFor={id} className="font-mono text-xs tracking-widest text-muted-foreground">{label.toUpperCase()}</label>
      <Input id={id} name={name} className={`bg-background/80 ${className || ""}`} {...inputProps} />
    </div>
  );
}
