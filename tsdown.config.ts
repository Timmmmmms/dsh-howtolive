import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { defineConfig, type TsdownPlugin } from 'tsdown'
import { transform } from 'lightningcss'

const PKG_ID = 'dsh-howtolive'
const CSS_VIRTUAL_PREFIX = '\0howtolive-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * 浏览器端由 dsh-client-modules / Vite 提供的平台共享模块表，
 * 这些模块必须保持 external，由 window.__ModuleLoader__ 在运行时注入。
 */
const PLATFORM_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/**
 * 独立编译 CSS Modules 并按官方 dsh-client-ui-* 约定在浏览器端注入 <style> 标签，
 * 避免依赖 deepseek-harness monorepo。
 */
function clientStylesPlugin(): TsdownPlugin {
  return {
    name: 'howtolive-css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      const abs = resolve(dirname(importer), source)
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      const entries = Object.entries(cssExports ?? {}).sort(([a], [b]) => a.localeCompare(b))
      for (const [local, exp] of entries) {
        classMap[local] = exp.name
      }
      const tagId = `${PKG_ID}/${basename(fileId)}`
      const cssText = code.toString()
      const moduleCode = [
        `const css = ${JSON.stringify(cssText)};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
        `  const tag = document.createElement('style');`,
        `  tag.dataset.plugin = ${JSON.stringify(PKG_ID)};`,
        `  tag.dataset.pluginCss = tagId;`,
        `  tag.textContent = css;`,
        `  document.head.appendChild(tag);`,
        `}`,
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
      return { code: moduleCode, moduleSideEffects: 'no-treeshake' }
    },
  }
}

const isPlatformExternal = (id: string) => PLATFORM_EXTERNALS.has(id)

export default defineConfig([
  // Host ESM 产物（Node 侧插件与工具）
  {
    name: `${PKG_ID}/host`,
    entry: { 'host/index': 'src/host/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      neverBundle: [/^@deepseek-ai\//, /^node:/],
    },
  },
  // Shared ESM 产物（Host/Client 共用纯函数与类型）
  {
    name: `${PKG_ID}/shared`,
    entry: { 'shared/index': 'src/shared/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'neutral',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
  },
  // Browser Client CJS 闭包工厂产物（严格对齐 dsh-client-modules 协议）
  {
    name: `${PKG_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    minify: { compress: false, mangle: false },
    deps: {
      neverBundle: isPlatformExternal,
      alwaysBundle: (id: string) => !isPlatformExternal(id),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    plugins: [clientStylesPlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      chunkFileNames: 'client.[name].js',
      sourcemapExcludeSources: false,
      banner: () => `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
