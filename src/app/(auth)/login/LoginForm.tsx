"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

interface LoginFormProps {
  tenantName: string;
  logoUrl: string | null;
}

export function LoginForm({ tenantName, logoUrl }: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Usuario o contraseña incorrectos.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-[0_1px_3px_rgba(44,31,21,0.08)]">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={tenantName}
              className="w-14 h-14 rounded-full object-contain border border-[#E0D5CA] bg-white"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#C1643F] flex items-center justify-center">
              <span className="text-[#FAF7F2] font-bold text-xl font-heading">NX</span>
            </div>
          )}
        </div>
        <h1 className="text-xl font-heading font-bold text-[#2C1F15]">{tenantName}</h1>
        <p className="text-sm text-[#7A6358]">Ingresa a tu cuenta</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-[#2C1F15]">Usuario</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu.usuario"
              required
              autoComplete="username"
              className="border-[#E0D5CA] focus-visible:ring-[#C1643F]/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[#2C1F15]">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="border-[#E0D5CA] focus-visible:ring-[#C1643F]/30 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A6358] hover:text-[#2C1F15] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-[#B94040] bg-[#B94040]/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C1643F] hover:bg-[#A8522F] text-[#FAF7F2] font-medium"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
