import nextVitals from "eslint-config-next/core-web-vitals";

export default [{ ignores: [".next/**", "node_modules/**", ".local/**", "attached_assets/**"] }, ...nextVitals];