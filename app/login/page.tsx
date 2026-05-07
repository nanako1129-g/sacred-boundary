"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setErrorDetail(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (error) {
      setMessage("ログインに失敗しました。メールアドレスとパスワードを確認してください。");
      setErrorDetail(`${error.name}: ${error.message}`);
      return;
    }
    router.push("/");
    router.refresh();
  };

  const handleSignUp = async () => {
    setIsSubmitting(true);
    setMessage(null);
    setErrorDetail(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setIsSubmitting(false);

    if (error) {
      setMessage("新規登録に失敗しました。別のメールアドレスでお試しください。");
      setErrorDetail(`${error.name}: ${error.message}`);
      return;
    }
    setMessage("登録しました。メール確認が必要な場合は受信箱をご確認ください。");
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4">
      <div className="rounded-2xl border border-torii/20 bg-washi/95 p-6 shadow-ema">
        <h1 className="text-2xl font-bold text-indigo-deep">ログイン</h1>
        <p className="mt-1 text-sm text-indigo-deep/70">
          御朱印記録と写真投稿はログイン後に利用できます。
        </p>
        <form className="mt-5 space-y-4" onSubmit={handleSignIn}>
          <label className="block text-sm">
            <span className="mb-1 block text-indigo-deep">メールアドレス</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none ring-torii/30 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-indigo-deep">パスワード</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none ring-torii/30 focus:ring-2"
            />
          </label>
          {message && <p className="text-sm text-torii">{message}</p>}
          {errorDetail && <p className="text-xs text-red-700">{errorDetail}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-md bg-torii px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={isSubmitting}
              className="flex-1 rounded-md border border-torii/50 bg-white px-3 py-2 text-sm font-semibold text-torii disabled:opacity-60"
            >
              新規登録
            </button>
          </div>
        </form>
        <Link href="/" className="mt-4 inline-block text-xs text-indigo-deep/70 underline">
          地図とAI分析に戻る
        </Link>
      </div>
    </main>
  );
}
