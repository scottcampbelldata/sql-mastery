/// <reference types="vite/client" />

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
        renderButton(parent: HTMLElement, options: { type?: string; theme?: string; size?: string; text?: string }): void;
      };
    };
  };
}
