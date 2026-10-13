import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://ampr.site",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/staging/api"),
        cookieDomainRewrite: "",
        cookiePathRewrite: "/",
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Origin", "https://ampr.site");
          });
          // La sesión llega por HTTP local; conservar HttpOnly y limitarla al sitio local.
          proxy.on("proxyRes", (proxyRes) => {
            const cookies = proxyRes.headers["set-cookie"];
            if (cookies) {
              proxyRes.headers["set-cookie"] = cookies.map((cookie) =>
                cookie.replace(/;\s*Secure/gi, "").replace(/SameSite=None/gi, "SameSite=Lax"),
              );
            }
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
