"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("Invalid password");
        setPassword("");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f3ef]">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-10 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-stone-800">
            Office of the Clerk
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-stone-400">
            Edison Township
          </p>
          <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-stone-200/60">
          <label htmlFor="password" className="block text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            className="mt-2 w-full rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
            placeholder="Enter password"
          />

          {error && (
            <p className="mt-2 text-[11px] text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-stone-800 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
