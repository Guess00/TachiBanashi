(function() {
  'use strict';

  const htmlEl = document.documentElement;
  const PAGE_TYPE = htmlEl.dataset.page || 'home';
  const CURRENT_EP = htmlEl.dataset.ep ? Number(htmlEl.dataset.ep) : null;
  const EPISODES = window.TACHIBANASHI_META || [];
  const RAW_INDEX = window.TACHIBANASHI_INDEX || {};

  // Precompute lowercase full text for instant search
  const SEARCH_INDEX = new Map();
  for (const ep of EPISODES) {
    const paras = RAW_INDEX[ep.ep] || [];
    SEARCH_INDEX.set(ep.ep, {
      paras,
      fullLower: paras.join('\n').toLowerCase()
    });
  }

  let currentLang = htmlEl.getAttribute('data-lang') || 'both';
  let currentYear = 'all';
  let sortAsc = true;
  let searchQuery = '';
  let highlightMarks = [];
  let highlightIdx = -1;
  let hiddenMatchCount = 0;

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightInlineHtml(plainText, q) {
    if (!q) return escapeHtml(plainText);
    const re = new RegExp(escapeRegex(q), 'gi');
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(plainText)) !== null) {
      out += escapeHtml(plainText.slice(last, m.index));
      out += '<mark class="hl">' + escapeHtml(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    out += escapeHtml(plainText.slice(last));
    return out;
  }

  function epFile(epNum) {
    return 'ep' + String(epNum).padStart(2, '0') + '.html';
  }

  function buildEpHref(epNum, q, fromHome) {
    const base = fromHome ? ('episodes/' + epFile(epNum)) : epFile(epNum);
    return q ? (base + '?q=' + encodeURIComponent(q)) : base;
  }

  function searchEpisode(epNum, q) {
    const qLower = q.toLowerCase();
    const idx = SEARCH_INDEX.get(epNum);
    if (!idx || !qLower || !idx.fullLower.includes(qLower)) {
      return { count: 0, snippets: [] };
    }
    let count = 0;
    const snippets = [];
    for (const p of idx.paras) {
      const pLower = p.toLowerCase();
      let pos = 0;
      let firstPos = -1;
      while ((pos = pLower.indexOf(qLower, pos)) !== -1) {
        if (firstPos === -1) firstPos = pos;
        count++;
        pos += qLower.length;
      }
      if (firstPos !== -1 && snippets.length < 2) {
        const start = Math.max(0, firstPos - 26);
        const end = Math.min(p.length, firstPos + q.length + 46);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < p.length ? '…' : '';
        snippets.push(prefix + p.slice(start, end) + suffix);
      }
    }
    return { count, snippets };
  }

  // ===== Language Switcher =====
  function syncLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.langSet === currentLang);
    });
  }

  function setLang(mode) {
    if (!['both', 'zh', 'jp'].includes(mode)) mode = 'both';
    currentLang = mode;
    htmlEl.setAttribute('data-lang', mode);
    syncLangButtons();
    try { localStorage.setItem('tachibanashi_lang', mode); } catch (e) {}
    if (PAGE_TYPE === 'episode' && searchQuery) {
      applyArticleHighlight();
    }
  }

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.langSet));
  });
  syncLangButtons();

  // ===== Back to Top FAB =====
  const fabTop = document.getElementById('fab-top');
  if (fabTop) {
    window.addEventListener('scroll', () => {
      fabTop.classList.toggle('visible', window.scrollY > 420);
    }, { passive: true });
    fabTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ===== HOME PAGE LOGIC =====
  if (PAGE_TYPE === 'home') {
    const homeSearch = document.getElementById('home-search');
    const homeSearchClear = document.getElementById('home-search-clear');
    const homeStatus = document.getElementById('home-status');
    const homeTocList = document.getElementById('home-toc-list');

    function renderHomeList() {
      const q = searchQuery;
      let list = EPISODES.slice();
      if (currentYear !== 'all') {
        const yr = Number(currentYear);
        list = list.filter(e => e.year === yr);
      }
      if (!sortAsc) list.reverse();

      const results = [];
      let totalHits = 0;
      for (const ep of list) {
        if (q) {
          const res = searchEpisode(ep.ep, q);
          if (res.count > 0) {
            totalHits += res.count;
            results.push({ ep, res });
          }
        } else {
          results.push({ ep, res: null });
        }
      }

      if (q) {
        homeStatus.textContent = `关键词「${q}」：共在 ${results.length} 回中命中 ${totalHits} 处`;
      } else {
        homeStatus.textContent = currentYear === 'all'
          ? `共 ${results.length} 回专栏 · 点击任意一回进入双栏阅读`
          : `${currentYear} 年共 ${results.length} 回专栏`;
      }

      if (results.length === 0) {
        homeTocList.innerHTML = `<li class="empty-state">没有找到包含「${escapeHtml(q)}」的内容，试试换一个关键词吧。</li>`;
        return;
      }

      homeTocList.innerHTML = results.map(({ ep, res }) => {
        const badge = res ? `<span class="card-badge">命中 ${res.count} 处</span>` : '';
        const snippetsHtml = res && res.snippets.length
          ? `<div class="card-snippets">${res.snippets.map(s => `<div class="card-snippet">${highlightInlineHtml(s, q)}</div>`).join('')}</div>`
          : '';
        return `
          <li>
            <a href="${buildEpHref(ep.ep, q, true)}" class="home-card">
              <div class="home-card-top">
                <span class="card-ep">${ep.label}</span>
                <span class="card-date">${ep.date}</span>
                ${badge}
              </div>
              <div class="card-summary">${ep.summaryHtml}</div>
              <div class="card-goal">${ep.goalHtml}</div>
              ${snippetsHtml}
            </a>
          </li>`;
      }).join('');
    }

    function updateHomeQuery(val) {
      searchQuery = val.trim();
      homeSearchClear.classList.toggle('visible', searchQuery.length > 0);
      renderHomeList();
    }

    homeSearch.addEventListener('input', e => updateHomeQuery(e.target.value));
    homeSearchClear.addEventListener('click', () => {
      homeSearch.value = '';
      updateHomeQuery('');
      homeSearch.focus();
    });

    document.getElementById('year-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.year-tab');
      if (!btn) return;
      currentYear = btn.dataset.year;
      document.querySelectorAll('.year-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderHomeList();
    });

    document.getElementById('sort-toggle').addEventListener('click', () => {
      sortAsc = !sortAsc;
      document.getElementById('sort-label').textContent = sortAsc ? '正序 1 → 28' : '倒序 28 → 1';
      renderHomeList();
    });

    // Support incoming ?q= on home page if provided
    const initQ = new URLSearchParams(location.search).get('q');
    if (initQ) {
      homeSearch.value = initQ;
      updateHomeQuery(initQ);
    } else {
      renderHomeList();
    }
    return;
  }

  // ===== EPISODE READER PAGE LOGIC =====
  const sidebarSearch = document.getElementById('sidebar-search');
  const sidebarSearchClear = document.getElementById('sidebar-search-clear');
  const sidebarList = document.getElementById('sidebar-list');
  const articleMount = document.getElementById('article-mount');
  const searchBanner = document.getElementById('search-banner');
  const searchBannerText = document.getElementById('search-banner-text');
  const hlPrev = document.getElementById('hl-prev');
  const hlNext = document.getElementById('hl-next');
  const hlClear = document.getElementById('hl-clear');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');

  function renderSidebarList() {
    const q = searchQuery;
    const rows = [];
    for (const ep of EPISODES) {
      if (q) {
        const res = searchEpisode(ep.ep, q);
        if (res.count > 0) rows.push({ ep, count: res.count });
      } else {
        rows.push({ ep, count: 0 });
      }
    }

    if (rows.length === 0) {
      sidebarList.innerHTML = `<li class="sidebar-empty">无匹配回数</li>`;
      return;
    }

    sidebarList.innerHTML = rows.map(({ ep, count }) => {
      const isActive = ep.ep === CURRENT_EP;
      const hitBadge = count > 0 ? `<span class="sb-hit">${count}</span>` : '';
      return `
        <li>
          <a href="${buildEpHref(ep.ep, q, false)}" class="sidebar-item${isActive ? ' active' : ''}" data-ep="${ep.ep}">
            <span class="sb-ep">${ep.label}</span>
            <span class="sb-right">${hitBadge}<span class="sb-ym">${ep.ym}</span></span>
          </a>
        </li>`;
    }).join('');

    const activeEl = sidebarList.querySelector('.sidebar-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function isHiddenByLang(el) {
    if (!el) return false;
    if (currentLang === 'zh' && el.closest('.jp')) return true;
    if (currentLang === 'jp' && el.closest('.zh, .h2-sub, .h3-sub')) return true;
    return false;
  }

  function highlightDomText(root, q) {
    const visibleMarks = [];
    let hiddenCount = 0;
    if (!q) return { visibleMarks, hiddenCount };
    const re = new RegExp(escapeRegex(q), 'gi');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'MARK') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    for (const node of textNodes) {
      const val = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(val)) continue;
      re.lastIndex = 0;
      const hidden = isHiddenByLang(node.parentElement);
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      while ((m = re.exec(val)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(val.slice(last, m.index)));
        const mk = document.createElement('mark');
        mk.className = 'hl';
        mk.textContent = m[0];
        frag.appendChild(mk);
        if (hidden) hiddenCount++;
        else visibleMarks.push(mk);
        last = m.index + m[0].length;
      }
      if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
    return { visibleMarks, hiddenCount };
  }

  function clearArticleHighlight() {
    articleMount.querySelectorAll('mark.hl').forEach(mk => {
      const parent = mk.parentNode;
      parent.replaceChild(document.createTextNode(mk.textContent), mk);
      parent.normalize();
    });
    highlightMarks = [];
    highlightIdx = -1;
    hiddenMatchCount = 0;
  }

  function updateBannerText() {
    if (!searchQuery) return;
    if (highlightMarks.length > 0) {
      const curStr = highlightIdx >= 0 ? `（第 ${highlightIdx + 1} / ${highlightMarks.length} 处）` : '';
      searchBannerText.textContent = `正在高亮「${searchQuery}」：当前视图命中 ${highlightMarks.length} 处${curStr}`;
    } else if (hiddenMatchCount > 0) {
      searchBannerText.textContent = `「${searchQuery}」在另一语言段落中命中 ${hiddenMatchCount} 处，切换至「中日」即可查看`;
    } else {
      searchBannerText.textContent = `正在搜索「${searchQuery}」：本回未命中，可在左侧目录切换至其他命中回数`;
    }
  }

  function jumpToHighlight(nextIdx) {
    if (!highlightMarks.length) return;
    if (highlightIdx >= 0 && highlightMarks[highlightIdx]) {
      highlightMarks[highlightIdx].classList.remove('hl-current');
    }
    highlightIdx = (nextIdx + highlightMarks.length) % highlightMarks.length;
    const el = highlightMarks[highlightIdx];
    el.classList.add('hl-current');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateBannerText();
  }

  function applyArticleHighlight() {
    clearArticleHighlight();
    if (!searchQuery) {
      searchBanner.classList.remove('visible');
      return;
    }
    const res = highlightDomText(articleMount, searchQuery);
    highlightMarks = res.visibleMarks;
    hiddenMatchCount = res.hiddenCount;
    searchBanner.classList.add('visible');
    hlPrev.style.display = highlightMarks.length > 1 ? '' : 'none';
    hlNext.style.display = highlightMarks.length > 1 ? '' : 'none';
    if (highlightMarks.length > 0) {
      highlightIdx = 0;
      highlightMarks[0].classList.add('hl-current');
    }
    updateBannerText();
  }

  function syncUrlQuery(q) {
    try {
      const url = new URL(location.href);
      if (q) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function updateSidebarQuery(val, shouldSyncUrl) {
    searchQuery = val.trim();
    sidebarSearchClear.classList.toggle('visible', searchQuery.length > 0);
    renderSidebarList();
    applyArticleHighlight();
    if (shouldSyncUrl) syncUrlQuery(searchQuery);
  }

  sidebarSearch.addEventListener('input', e => updateSidebarQuery(e.target.value, true));
  sidebarSearchClear.addEventListener('click', () => {
    sidebarSearch.value = '';
    updateSidebarQuery('', true);
    sidebarSearch.focus();
  });
  hlClear.addEventListener('click', () => {
    sidebarSearch.value = '';
    updateSidebarQuery('', true);
  });
  hlPrev.addEventListener('click', () => jumpToHighlight(highlightIdx - 1));
  hlNext.addEventListener('click', () => jumpToHighlight(highlightIdx + 1));

  // Mobile Drawer
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.body.classList.toggle('drawer-open');
  });
  document.getElementById('sidebar-backdrop').addEventListener('click', () => {
    document.body.classList.remove('drawer-open');
  });

  // Photo Lightbox
  if (lightbox && lightboxImg) {
    articleMount.querySelectorAll('.article-photo img').forEach(img => {
      img.addEventListener('click', () => {
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        lightbox.classList.add('open');
      });
    });
    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (lightbox) lightbox.classList.remove('open');
      document.body.classList.remove('drawer-open');
    }
  });

  // Scroll active sidebar item into view on initial load
  const initActive = sidebarList.querySelector('.sidebar-item.active');
  if (initActive) initActive.scrollIntoView({ block: 'nearest' });

  // Apply incoming ?q= highlight
  const initQ = new URLSearchParams(location.search).get('q');
  if (initQ) {
    sidebarSearch.value = initQ;
    updateSidebarQuery(initQ, false);
    if (highlightMarks.length > 0) {
      setTimeout(() => highlightMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
  }
})();
