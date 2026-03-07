/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAS_API_URL: string;
  readonly VITE_GOOGLE_SPREADSHEET_ID: string;
  readonly VITE_GOOGLE_SHEET_ID: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
