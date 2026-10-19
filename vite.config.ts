import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";

const PORT = 5180;
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

type Req = IncomingMessage;
type Res = ServerResponse;

/**
 * دخول مدير المنصة من خادم التطوير المحلي:
 * كلمة المرور تبقى في .env.local على هذا الجهاز (متغيرات بلا VITE_)، ولا تصل إلى كود المتصفح أبدًا.
 * المتصفح يطلب جلسة من /__platform/session فيأخذ رموز الجلسة فقط.
 * الطلب مقبول من صفحة اللوحة نفسها على 127.0.0.1 فقط (لا من مواقع أخرى مفتوحة في المتصفح).
 */
function platformAdminSession(env: Record<string, string>): Plugin {
  const headerValue = (req: Req, name: string) => {
    const value = req.headers[name];
    return String(Array.isArray(value) ? value[0] : value ?? "");
  };
  const allowed = (req: Req) => {
    const host = headerValue(req, "host");
    const origin = headerValue(req, "origin");
    const fetchSite = headerValue(req, "sec-fetch-site");
    return ALLOWED_HOSTS.has(host)
      && (!origin || origin === `http://${host}`)
      && (!fetchSite || fetchSite === "same-origin")
      && headerValue(req, "x-platform-panel") === "1";
  };
  const send = (res: Res, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };
  const settings = () => ({
    url: String(env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, ""),
    anonKey: String(env.VITE_SUPABASE_ANON_KEY ?? "").trim(),
    email: String(env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase(),
    password: String(env.PLATFORM_ADMIN_PASSWORD ?? ""),
  });
  const missing = (s: ReturnType<typeof settings>) =>
    [
      !s.url && "VITE_SUPABASE_URL",
      !s.anonKey && "VITE_SUPABASE_ANON_KEY",
      !s.email && "PLATFORM_ADMIN_EMAIL",
      !s.password && "PLATFORM_ADMIN_PASSWORD",
    ].filter(Boolean) as string[];

  return {
    name: "platform-admin-session",
    configureServer(server: ViteDevServer) {
      // البريد المضبوط فقط (للتأكد أن الجلسة المحفوظة لنفس الحساب)
      server.middlewares.use("/__platform/config", (req: Req, res: Res) => {
        if (req.method !== "GET" || !allowed(req)) return send(res, 403, { error: "FORBIDDEN" });
        const s = settings();
        return send(res, 200, { email: s.email, missing: missing(s) });
      });
      // جلسة جديدة لحساب مدير المنصة
      server.middlewares.use("/__platform/session", async (req: Req, res: Res) => {
        if (req.method !== "POST" || !allowed(req)) return send(res, 403, { error: "FORBIDDEN" });
        const s = settings();
        const absent = missing(s);
        if (absent.length) return send(res, 500, { error: "CONFIG_MISSING", missing: absent });
        try {
          const response = await fetch(`${s.url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { apikey: s.anonKey, "Content-Type": "application/json" },
            body: JSON.stringify({ email: s.email, password: s.password }),
          });
          const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          if (!response.ok || !body.access_token || !body.refresh_token) {
            const reason = String(body.error_description ?? body.msg ?? body.message ?? body.error ?? response.status);
            return send(res, 401, { error: "SIGN_IN_FAILED", message: reason });
          }
          const user = (body.user ?? {}) as { email?: string };
          return send(res, 200, {
            access_token: body.access_token,
            refresh_token: body.refresh_token,
            email: String(user.email ?? s.email).toLowerCase(),
          });
        } catch {
          return send(res, 502, { error: "SIGN_IN_UNREACHABLE" });
        }
      });
    },
  };
}

// لوحة إدارة المنصة تعمل على هذا الجهاز فقط: لا تُفتح على الشبكة ولا تُنشر.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), platformAdminSession(env)],
    server: { host: "127.0.0.1", port: PORT, strictPort: true, open: true, cors: false },
    preview: { host: "127.0.0.1", port: 5181 },
  };
});
