import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import hljs from 'highlight.js/lib/core'
import createDOMPurify from 'dompurify'
import bashLang from 'highlight.js/lib/languages/bash'
import cssLang from 'highlight.js/lib/languages/css'
import goLang from 'highlight.js/lib/languages/go'
import javaLang from 'highlight.js/lib/languages/java'
import javascriptLang from 'highlight.js/lib/languages/javascript'
import jsonLang from 'highlight.js/lib/languages/json'
import pythonLang from 'highlight.js/lib/languages/python'
import rustLang from 'highlight.js/lib/languages/rust'
import sqlLang from 'highlight.js/lib/languages/sql'
import typescriptLang from 'highlight.js/lib/languages/typescript'
import xmlLang from 'highlight.js/lib/languages/xml'
import yamlLang from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bashLang)
hljs.registerLanguage('sh', bashLang)
hljs.registerLanguage('css', cssLang)
hljs.registerLanguage('go', goLang)
hljs.registerLanguage('java', javaLang)
hljs.registerLanguage('javascript', javascriptLang)
hljs.registerLanguage('js', javascriptLang)
hljs.registerLanguage('json', jsonLang)
hljs.registerLanguage('python', pythonLang)
hljs.registerLanguage('py', pythonLang)
hljs.registerLanguage('rust', rustLang)
hljs.registerLanguage('rs', rustLang)
hljs.registerLanguage('sql', sqlLang)
hljs.registerLanguage('typescript', typescriptLang)
hljs.registerLanguage('ts', typescriptLang)
hljs.registerLanguage('xml', xmlLang)
hljs.registerLanguage('html', xmlLang)
hljs.registerLanguage('yaml', yamlLang)
hljs.registerLanguage('yml', yamlLang)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
  highlight(code, language) {
    const lang = (language || '').trim().toLowerCase()
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(code, {
          language: lang,
          ignoreIllegals: true
        }).value
        return `<pre class="hljs"><code>${highlighted}</code></pre>`
      } catch {
        // Fallback below.
      }
    }

    const escaped = md.utils.escapeHtml(code)
    return `<pre class="hljs"><code>${escaped}</code></pre>`
  }
})

md.use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'beg_end'],
  katexOptions: {
    throwOnError: false,
    strict: 'ignore'
  }
})

const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => {
  return self.renderToken(tokens, idx, options)
})

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

const SANITIZE_OPTIONS = {
  USE_PROFILES: {
    html: true,
    svg: true,
    mathMl: true
  }
}

function resolvePurifier() {
  if (createDOMPurify && typeof createDOMPurify.sanitize === 'function') {
    return createDOMPurify
  }
  if (typeof createDOMPurify === 'function' && typeof window !== 'undefined') {
    const instance = createDOMPurify(window)
    if (instance && typeof instance.sanitize === 'function') {
      return instance
    }
  }
  return null
}

const purifier = resolvePurifier()

export function renderMarkdown(content) {
  const source = String(content || '')
  const html = md.render(source)
  if (!purifier) {
    return html
  }
  return purifier.sanitize(html, SANITIZE_OPTIONS)
}
