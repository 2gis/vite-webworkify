declare module '*?webworkify' {
  const createWorker: () => Worker;
  export default createWorker;
}

declare module 'vite-plugin-webworkify' {
  interface WebworkifyOptions {
    include?: string | RegExp | Array<string | RegExp>;
    exclude?: string | RegExp | Array<string | RegExp>;
  }
  
  export function webworkify(options?: WebworkifyOptions): Plugin;
  export default webworkify;
}