mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  fontFamily: 'Noto Sans KR, Inter, sans-serif',
  flowchart: { useMaxWidth: false, htmlLabels: false },
  sequence:   { useMaxWidth: false },
  gantt:      { useMaxWidth: false },
  themeVariables: {
    edgeLabelBackground: '#ffffff',
  }
});

marked.use({
  breaks: true,
  gfm: true,
  html: true,
  renderer: {
    code({ text, lang }) {
      if (lang === 'mermaid') {
        return `<div class="mermaid">${text}</div>`;
      }
      if (!lang) lang = '';
      const validLang = lang && hljs.getLanguage(lang) ? lang : null;
      const highlighted = validLang
        ? hljs.highlight(text, { language: validLang }).value
        : (lang ? hljs.highlightAuto(text).value : text.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
      const langLabel = lang ? `<div class="code-lang">${lang}</div>` : '';
      return `<div style="position:relative">${langLabel}<pre class="hljs"><code>${highlighted}</code></pre></div>`;
    },
    heading({ text, depth, raw }) {
      const slug = raw
        .replace(/`[^`]*`/g, m => m.slice(1, -1))
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-');
      return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
    }
  }
});

let META = {};

// ── Nav icons (Lucide-style stroke SVGs) ──
const ICON_PATHS = {
  // 시작하기
  'README.md': `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
  // 통합 가이드
  'integrations/philosophy.md':        `<path d="M12 3v2"/><path d="M12 19v2"/><path d="m5.64 5.64 1.41 1.41"/><path d="m16.95 16.95 1.41 1.41"/><path d="M3 12h2"/><path d="M19 12h2"/><circle cx="12" cy="12" r="4"/>`,
  'integrations/update-kit.md':        `<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>`,
  'integrations/sentry.md':            `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>`,
  'integrations/posthog.md':           `<rect width="4" height="8" x="4" y="12" rx="1"/><rect width="4" height="14" x="10" y="6" rx="1"/><rect width="4" height="11" x="16" y="9" rx="1"/><line x1="2" x2="22" y1="21" y2="21"/>`,
  'integrations/analytics.md':         `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`,
  'integrations/fcm.md':               `<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`,
  'integrations/deployment-android.md':`<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>`,
  'integrations/security.md':          `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
  // 컨벤션
  'conventions/README.md':             `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
  'conventions/architecture.md':       `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  'conventions/kits.md':               `<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>`,
  'conventions/api-contract.md':       `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><line x1="8" x2="16" y1="13" y2="13"/><line x1="8" x2="16" y1="17" y2="17"/><line x1="8" x2="12" y1="9" y2="9"/>`,
  'conventions/error-handling.md':     `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
  'conventions/loading.md':            `<path d="M21 12a9 9 0 1 1-6.219-8.56"/>`,
  'conventions/naming.md':             `<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>`,
  'conventions/testing.md':            `<path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/>`,
  // 튜토리얼
  'tutorials/build-gymlog.md':         `<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.58 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>`,
  'tutorials/dogfood-2026-04-19-gymlog.md': `<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>`,
};
const DEFAULT_ICON_PATH = `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/>`;
function navIcon(path) {
  const inner = ICON_PATHS[path] || DEFAULT_ICON_PATH;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// 관련 문서 / 책 목차 섹션을 content에서 분리해 doc-footer로 이동
function extractDocFooter(contentEl) {
  const children = Array.from(contentEl.children);
  const footerPatterns = [/관련\s*문서/, /책\s*목차/];

  let splitIdx = -1;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.tagName === 'H2') {
      const text = el.textContent.replace(/^\d+\.\s*/, '').trim();
      if (footerPatterns.some(p => p.test(text))) {
        // 앞에 <hr>이 있으면 그것도 포함
        splitIdx = (i > 0 && children[i - 1].tagName === 'HR') ? i - 1 : i;
        break;
      }
    }
  }

  if (splitIdx === -1) return null;

  const toMove = children.slice(splitIdx);
  const wrapper = document.createElement('div');
  toMove.forEach(el => {
    contentEl.removeChild(el);
    wrapper.appendChild(el);
  });
  return wrapper.innerHTML;
}

function transformEmoji(html) {
  return html
    .replace(/✅/g, '<span class="si si-check"></span>')
    .replace(/❌/g, '<span class="si si-cross"></span>')
    .replace(/🔴/g, '<span class="si si-dot si-red"></span>')
    .replace(/🟡/g, '<span class="si si-dot si-yellow"></span>')
    .replace(/🟢/g, '<span class="si si-dot si-green"></span>')
    .replace(/⚠️/g, '<span class="si si-warn"></span>')
    .replace(/🚨/g, '<span class="si si-alert"></span>');
}

// .md 상대 경로 링크를 SPA 내부 라우팅으로 인터셉트
function interceptDocLinks(el, currentDocPath) {
  const baseDir = currentDocPath.includes('/')
    ? currentDocPath.slice(0, currentDocPath.lastIndexOf('/') + 1)
    : '';

  el.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;
    if (!href.endsWith('.md')) return;

    const raw = baseDir + href;
    const parts = raw.split('/');
    const resolved = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p && p !== '.') resolved.push(p);
    }
    const docPath = resolved.join('/');

    a.setAttribute('href', '#' + docPath);
    a.addEventListener('click', e => {
      e.preventDefault();
      loadDoc(docPath);
    });
  });
}

function isMobile() { return window.innerWidth <= 768; }

let _typewriterTimer = null;
function typewriter(el, text, speed = 32) {
  if (_typewriterTimer) clearTimeout(_typewriterTimer);
  el.textContent = '';
  let i = 0;
  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      _typewriterTimer = setTimeout(tick, speed);
    }
  }
  tick();
}

async function loadDoc(docPath) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.doc === docPath);
  });
  if (isMobile()) closeMobileSidebar();

  const meta = META[docPath] || { title: docPath.split('/').pop().replace('.md', ''), desc: '' };
  typewriter(document.getElementById('post-title'), meta.title, 32);
  document.getElementById('post-desc').textContent = meta.desc;
  document.getElementById('content').innerHTML =
    '<p style="color:#9ca3af;text-align:center;padding:60px 0">로딩 중...</p>';

  const docFooterEl = document.getElementById('doc-footer');
  docFooterEl.style.display = 'none';
  docFooterEl.innerHTML = '';

  try {
    const res = await fetch('docs/' + docPath);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let md = await res.text();
    md = md.replace(/```\n\[개발자 맥북\][\s\S]*?```/g, '\n%%LOCAL_DEV_DIAGRAM%%\n');
    md = md.replace(/```\n\[인터넷 사용자\][\s\S]*?```/g, '\n%%PROD_DIAGRAM%%\n');
    let html = transformEmoji(marked.parse(md));
    html = html.replace(/<p>%%LOCAL_DEV_DIAGRAM%%<\/p>/g, DIAGRAMS['LOCAL_DEV']);
    html = html.replace(/<p>%%PROD_DIAGRAM%%<\/p>/g, DIAGRAMS['PROD']);

    const contentEl = document.getElementById('content');
    contentEl.innerHTML = html;

    document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));

    let mermaidId = 0;
    for (const el of document.querySelectorAll('#content .mermaid')) {
      const code = el.textContent.trim();
      const id = `mermaid-${mermaidId++}`;
      try {
        const { svg } = await mermaid.render(id, code);
        el.innerHTML = svg;
        const svgEl = el.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.setAttribute('overflow', 'visible');
          const vb = svgEl.getAttribute('viewBox');
          if (vb) {
            const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
            svgEl.setAttribute('viewBox', `${x} ${y} ${w + 40} ${h + 10}`);
          }
        }
      } catch(e) {
        el.innerHTML = `<pre style="color:red">${e.message}</pre>`;
      }
    }

    // footer 섹션 분리
    const footerHtml = extractDocFooter(contentEl);
    if (footerHtml) {
      docFooterEl.innerHTML = footerHtml;
      docFooterEl.style.display = 'block';
      interceptDocLinks(docFooterEl, docPath);
    }

    // 모바일 테이블 스크롤 래핑
    if (isMobile()) {
      contentEl.querySelectorAll('table').forEach(table => {
        if (table.closest('.table-wrap')) return;
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      });
    }

    interceptDocLinks(contentEl, docPath);

    window.scrollTo(0, 0);
    history.pushState({ doc: docPath }, '', '#' + docPath);
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<p style="color:#ef4444;padding:20px">오류: ${e.message}</p>`;
  }
}

function buildSidebar(manifest) {
  const sidebar = document.querySelector('.sidebar');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sidebar-close-btn';
  closeBtn.id = 'sidebar-close-btn';
  closeBtn.title = '사이드바 접기';
  closeBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>`;
  sidebar.appendChild(closeBtn);

  const brand = document.createElement('div');
  brand.className = 'sidebar-brand';
  brand.innerHTML = `
    <div class="sidebar-brand-mark"></div>
    <div class="sidebar-brand-text">
      <div class="name">${manifest.brand.name}</div>
      <div class="sub">${manifest.brand.sub}</div>
    </div>`;
  sidebar.appendChild(brand);

  manifest.groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'nav-group';
    groupEl.textContent = group.name;
    sidebar.appendChild(groupEl);

    group.files.forEach(file => {
      META[file.path] = { title: file.title, desc: file.desc };
      const a = document.createElement('a');
      a.className = 'nav-item';
      a.dataset.doc = file.path;
      const descHtml = file.desc ? `<span class="nav-item-desc">${file.desc}</span>` : '';
      a.innerHTML = `<span class="nav-icon">${navIcon(file.path)}</span><span class="nav-item-inner"><span class="nav-item-title">${file.title}</span>${descHtml}</span>`;
      sidebar.appendChild(a);

      if (file.children) {
        file.children.forEach(child => {
          META[child.path] = { title: child.title, desc: child.desc };
          const ca = document.createElement('a');
          ca.className = 'nav-item nav-item-child';
          ca.dataset.doc = child.path;
          const childDescHtml = child.desc ? `<span class="nav-item-desc">${child.desc}</span>` : '';
          ca.innerHTML = `<span class="nav-icon">${navIcon(child.path)}</span><span class="nav-item-inner"><span class="nav-item-title">${child.title}</span>${childDescHtml}</span>`;
          sidebar.appendChild(ca);
        });
      }
    });
  });

  sidebar.addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (item && item.dataset.doc) loadDoc(item.dataset.doc);
  });
}

async function init() {
  const res = await fetch('docs/manifest.json');
  const manifest = await res.json();
  buildSidebar(manifest);

  const hash = location.hash.slice(1);
  const firstDoc = manifest.groups[0].files[0].path;
  loadDoc(hash || firstDoc);
}

window.addEventListener('popstate', e => {
  if (e.state && e.state.doc) loadDoc(e.state.doc);
});

const backdrop = document.createElement('div');
backdrop.id = 'sidebar-backdrop';
document.body.appendChild(backdrop);
backdrop.addEventListener('click', closeMobileSidebar);

function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open');
}

function toggleSidebar() {
  if (isMobile()) {
    document.body.classList.toggle('sidebar-open');
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
}

document.getElementById('sidebar-open-btn').addEventListener('click', toggleSidebar);
document.addEventListener('click', e => {
  if (e.target.closest('#sidebar-close-btn')) toggleSidebar();
});

if (isMobile()) {
  document.body.classList.add('sidebar-collapsed');
}

init();
