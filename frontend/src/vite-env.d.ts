/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string
  readonly VITE_DEFAULT_MODE: string
  readonly VITE_WASM_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
