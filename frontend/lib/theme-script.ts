// Shared by the server layout (inline script) and the client theme store; no React here.
export const THEME_KEY = "leash-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Inlined in <head>: applies the stored choice (or the OS preference) before the first paint. */
export const THEME_SCRIPT = `try{var c=localStorage.getItem("${THEME_KEY}"),d=c==="dark"||(c!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;
