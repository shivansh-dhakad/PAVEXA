declare global {
  interface Window {
    L: any;
  }
}

let loading: Promise<any> | null = null;

/** Loads Leaflet from the CDN once and resolves with the global `L`. */
export function loadLeaflet(): Promise<any> {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      loading = null;
      reject(new Error("Map library failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
